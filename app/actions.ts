"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  automations,
  commitments,
  contactFacts,
  contacts,
  conversations,
  reminders,
  users,
  type ActionType,
  type TriggerType,
} from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizePhoneNumber } from "@/lib/phone";
import { logActivity } from "@/lib/activity";
import { sendMessage } from "@/lib/sms/send-message";
import { computeNextRun, occurrenceKeyFor } from "@/lib/automations/recurrence";
import { executeAutomation } from "@/lib/automations/engine";
import { destroySession } from "@/lib/auth/session";
import { getContact, displayName } from "@/lib/queries";

// ---------------------------------------------------------------- contacts

const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  nickname: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().optional(),
  birthday: z.string().optional(),
  relationshipType: z.string().default("FRIEND"),
  importance: z.enum(["LOW", "MEDIUM", "HIGH"]).default("MEDIUM"),
  preferredLanguage: z.string().optional(),
  timezone: z.string().optional(),
  notes: z.string().optional(),
  desiredContactCadenceDays: z.string().optional(),
  communicationStyle: z.string().optional(),
  emojiStyle: z.string().optional(),
  humorAllowed: z.string().optional(),
  autonomyLevel: z.string().default("1"),
  automaticBirthdayGreeting: z.string().optional(),
});

function parseContactForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const data = contactSchema.parse(raw);
  let phoneNumber: string | null = null;
  if (data.phoneNumber?.trim()) {
    phoneNumber = normalizePhoneNumber(data.phoneNumber);
    if (!phoneNumber) throw new Error("Invalid phone number");
  }
  return {
    firstName: data.firstName.trim(),
    lastName: data.lastName?.trim() || null,
    displayName: data.displayName?.trim() || null,
    nickname: data.nickname?.trim() || null,
    phoneNumber,
    email: data.email?.trim() || null,
    birthday: data.birthday?.trim() || null,
    relationshipType: data.relationshipType,
    importance: data.importance,
    preferredLanguage: data.preferredLanguage?.trim() || null,
    timezone: data.timezone?.trim() || null,
    notes: data.notes?.trim() || null,
    desiredContactCadenceDays: data.desiredContactCadenceDays
      ? Number(data.desiredContactCadenceDays) || null
      : null,
    communicationStyle: data.communicationStyle?.trim() || null,
    emojiStyle: data.emojiStyle?.trim() || null,
    humorAllowed: data.humorAllowed === "on",
    autonomyLevel: Math.min(4, Math.max(0, Number(data.autonomyLevel) || 0)),
    automaticBirthdayGreeting: data.automaticBirthdayGreeting === "on",
  };
}

export async function createContact(formData: FormData): Promise<void> {
  const db = await getDb();
  const values = parseContactForm(formData);
  const [owner] = await db.select().from(users).limit(1);
  if (!owner) throw new Error("No owner user exists; run the seed script");
  const [created] = await db
    .insert(contacts)
    .values({ ...values, userId: owner.id })
    .returning();
  await logActivity({
    actor: "USER",
    action: "CONTACT_CREATED",
    summary: `Contact created: ${created.firstName}`,
    contactId: created.id,
  });
  revalidatePath("/people");
  redirect(`/people/${created.id}`);
}

export async function updateContact(
  contactId: string,
  formData: FormData,
): Promise<void> {
  const db = await getDb();
  const values = parseContactForm(formData);
  await db
    .update(contacts)
    .set({ ...values, updatedAt: sql`now()` })
    .where(eq(contacts.id, contactId));
  await logActivity({
    actor: "USER",
    action: "CONTACT_UPDATED",
    summary: `Contact updated: ${values.firstName}`,
    contactId,
  });
  revalidatePath(`/people/${contactId}`);
  redirect(`/people/${contactId}`);
}

export async function archiveContact(contactId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(contacts)
    .set({ archivedAt: new Date(), updatedAt: sql`now()` })
    .where(eq(contacts.id, contactId));
  await logActivity({
    actor: "USER",
    action: "CONTACT_ARCHIVED",
    summary: "Contact archived",
    contactId,
  });
  revalidatePath("/people");
  redirect("/people");
}

// ------------------------------------------------------------ conversations

export async function takeOverConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  const [conv] = await db
    .update(conversations)
    .set({ aiControlState: "USER" })
    .where(eq(conversations.id, conversationId))
    .returning();
  await logActivity({
    actor: "USER",
    action: "TAKEOVER",
    summary: "User took over the conversation; AI disabled",
    contactId: conv?.contactId,
    conversationId,
  });
  revalidatePath(`/inbox/${conversationId}`);
}

export async function returnConversationToAi(
  conversationId: string,
): Promise<void> {
  const db = await getDb();
  const [conv] = await db
    .update(conversations)
    .set({
      aiControlState: "AI",
      escalationReason: null,
      escalationNotifiedAt: null,
    })
    .where(eq(conversations.id, conversationId))
    .returning();
  await logActivity({
    actor: "USER",
    action: "RETURNED_TO_AI",
    summary: "User returned the conversation to AI",
    contactId: conv?.contactId,
    conversationId,
  });
  revalidatePath(`/inbox/${conversationId}`);
}

export async function pauseConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  const [conv] = await db
    .update(conversations)
    .set({ aiControlState: "PAUSED" })
    .where(eq(conversations.id, conversationId))
    .returning();
  await logActivity({
    actor: "USER",
    action: "CONVERSATION_PAUSED",
    summary: "Conversation paused; nobody responds automatically",
    contactId: conv?.contactId,
    conversationId,
  });
  revalidatePath(`/inbox/${conversationId}`);
}

export async function closeConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  const [conv] = await db
    .update(conversations)
    .set({ status: "CLOSED" })
    .where(eq(conversations.id, conversationId))
    .returning();
  await logActivity({
    actor: "USER",
    action: "CONVERSATION_CLOSED",
    summary: "Conversation closed",
    contactId: conv?.contactId,
    conversationId,
  });
  revalidatePath("/inbox");
  redirect("/inbox");
}

export async function sendManualReply(
  conversationId: string,
  formData: FormData,
): Promise<void> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const db = await getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (!conv) throw new Error("Conversation not found");

  const contact = conv.contactId ? await getContact(conv.contactId) : null;
  const to = contact?.phoneNumber ?? conv.peerNumber;
  if (!to) throw new Error("Conversation has no recipient number");

  // A manual reply always transfers control to the user. This guarantees the
  // AI can never send a competing response.
  if (conv.aiControlState !== "USER") {
    await db
      .update(conversations)
      .set({ aiControlState: "USER" })
      .where(eq(conversations.id, conversationId));
    await logActivity({
      actor: "USER",
      action: "TAKEOVER",
      summary: "User took over by replying manually",
      contactId: conv.contactId,
      conversationId,
    });
  }

  await sendMessage({
    to,
    text,
    sender: "USER",
    contactId: conv.contactId,
    conversationId,
  });
  revalidatePath(`/inbox/${conversationId}`);
}

// -------------------------------------------------------------- automations

const automationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.enum([
    "DATE",
    "BIRTHDAY",
    "ANNIVERSARY",
    "CRON",
    "INTERVAL",
    "NO_CONTACT_FOR",
    "INCOMING_SMS",
    "MANUAL",
    "FOLLOW_UP_DUE",
    "CUSTOM_EVENT",
  ]),
  actionType: z.enum([
    "SEND_SMS",
    "GENERATE_SMS",
    "REMIND_USER",
    "CREATE_TASK",
    "CREATE_CALENDAR_EVENT",
    "AI_EVALUATE",
    "ESCALATE",
    "UPDATE_CONTACT",
    "LOG_EVENT",
  ]),
  contactId: z.string().optional(),
  autonomyLevel: z.string().default("1"),
  triggerDate: z.string().optional(),
  triggerTime: z.string().optional(),
  triggerDays: z.string().optional(),
  triggerCron: z.string().optional(),
  actionText: z.string().optional(),
  actionPurpose: z.string().optional(),
  actionInstruction: z.string().optional(),
  actionTitle: z.string().optional(),
  actionDescription: z.string().optional(),
});

function parseAutomationForm(formData: FormData) {
  const data = automationSchema.parse(Object.fromEntries(formData.entries()));
  return {
    name: data.name.trim(),
    description: data.description?.trim() || null,
    triggerType: data.triggerType as TriggerType,
    triggerConfig: {
      ...(data.triggerDate?.trim() ? { date: data.triggerDate.trim() } : {}),
      ...(data.triggerTime?.trim() ? { time: data.triggerTime.trim() } : {}),
      ...(data.triggerDays?.trim()
        ? { days: Number(data.triggerDays) || undefined }
        : {}),
      ...(data.triggerCron?.trim() ? { cron: data.triggerCron.trim() } : {}),
    },
    actionType: data.actionType as ActionType,
    actionConfig: {
      ...(data.actionText?.trim() ? { text: data.actionText.trim() } : {}),
      ...(data.actionPurpose?.trim() ? { purpose: data.actionPurpose.trim() } : {}),
      ...(data.actionInstruction?.trim()
        ? { instruction: data.actionInstruction.trim() }
        : {}),
      ...(data.actionTitle?.trim() ? { title: data.actionTitle.trim() } : {}),
      ...(data.actionDescription?.trim()
        ? { description: data.actionDescription.trim() }
        : {}),
    },
    contactId: data.contactId?.trim() || null,
    autonomyLevel: Math.min(4, Math.max(0, Number(data.autonomyLevel) || 0)),
  };
}

export async function createAutomation(formData: FormData): Promise<void> {
  const db = await getDb();
  const values = parseAutomationForm(formData);
  const contact = values.contactId ? await getContact(values.contactId) : null;
  const nextRunAt = computeNextRun({
    triggerType: values.triggerType,
    triggerConfig: values.triggerConfig,
    contact,
    after: new Date(),
  });
  const [created] = await db
    .insert(automations)
    .values({ ...values, nextRunAt })
    .returning();
  await logActivity({
    actor: "USER",
    action: "AUTOMATION_CREATED",
    summary: `Automation created: ${created.name}`,
    contactId: values.contactId,
    entityType: "automation",
    entityId: created.id,
  });
  revalidatePath("/automations");
  redirect(`/automations/${created.id}`);
}

export async function updateAutomation(
  automationId: string,
  formData: FormData,
): Promise<void> {
  const db = await getDb();
  const values = parseAutomationForm(formData);
  const contact = values.contactId ? await getContact(values.contactId) : null;
  const nextRunAt = computeNextRun({
    triggerType: values.triggerType,
    triggerConfig: values.triggerConfig,
    contact,
    after: new Date(),
  });
  await db
    .update(automations)
    .set({ ...values, nextRunAt, updatedAt: sql`now()` })
    .where(eq(automations.id, automationId));
  await logActivity({
    actor: "USER",
    action: "AUTOMATION_UPDATED",
    summary: `Automation updated: ${values.name}`,
    contactId: values.contactId,
    entityType: "automation",
    entityId: automationId,
  });
  revalidatePath(`/automations/${automationId}`);
  redirect(`/automations/${automationId}`);
}

export async function toggleAutomation(automationId: string): Promise<void> {
  const db = await getDb();
  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId));
  if (!automation) return;
  const enabled = !automation.enabled;
  const contact = automation.contactId
    ? await getContact(automation.contactId)
    : null;
  const nextRunAt = enabled
    ? computeNextRun({
        triggerType: automation.triggerType,
        triggerConfig: automation.triggerConfig ?? {},
        contact,
        after: new Date(),
      })
    : automation.nextRunAt;
  await db
    .update(automations)
    .set({ enabled, nextRunAt, updatedAt: sql`now()` })
    .where(eq(automations.id, automationId));
  await logActivity({
    actor: "USER",
    action: enabled ? "AUTOMATION_ENABLED" : "AUTOMATION_DISABLED",
    summary: `Automation ${enabled ? "enabled" : "disabled"}: ${automation.name}`,
    entityType: "automation",
    entityId: automationId,
  });
  revalidatePath(`/automations/${automationId}`);
  revalidatePath("/automations");
}

export async function runAutomationNow(automationId: string): Promise<void> {
  const db = await getDb();
  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId));
  if (!automation) return;
  const now = new Date();
  // Manual runs get a unique occurrence so "Run now" always executes once.
  const occurrenceKey = `manual-${now.toISOString()}`;
  await executeAutomation({
    automation,
    occurrenceKey,
    scheduledFor: now,
    triggerPayload: { trigger: "MANUAL", requestedBy: "USER" },
  });
  revalidatePath(`/automations/${automationId}`);
  revalidatePath("/activity");
}

export async function skipNextOccurrence(automationId: string): Promise<void> {
  const db = await getDb();
  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId));
  if (!automation?.nextRunAt) return;
  const contact = automation.contactId
    ? await getContact(automation.contactId)
    : null;
  // Record a SKIPPED execution for the occurrence (prevents it from firing),
  // then advance nextRunAt.
  const occurrenceKey = occurrenceKeyFor({
    triggerType: automation.triggerType,
    scheduledFor: automation.nextRunAt,
    lastInteractionAt: contact?.lastInteractionAt,
  });
  const { automationExecutions } = await import("@/lib/db/schema");
  await db
    .insert(automationExecutions)
    .values({
      automationId,
      contactId: automation.contactId,
      occurrenceKey,
      scheduledFor: automation.nextRunAt,
      status: "SKIPPED",
      completedAt: new Date(),
      result: { skippedBy: "USER" },
    })
    .onConflictDoNothing();
  const nextRunAt = computeNextRun({
    triggerType: automation.triggerType,
    triggerConfig: automation.triggerConfig ?? {},
    contact,
    after: automation.nextRunAt,
  });
  await db
    .update(automations)
    .set({ nextRunAt, updatedAt: sql`now()` })
    .where(eq(automations.id, automationId));
  await logActivity({
    actor: "USER",
    action: "AUTOMATION_SKIPPED",
    summary: `Skipped next occurrence of "${automation.name}"`,
    entityType: "automation",
    entityId: automationId,
  });
  revalidatePath(`/automations/${automationId}`);
}

export async function deleteAutomation(automationId: string): Promise<void> {
  const db = await getDb();
  const [automation] = await db
    .delete(automations)
    .where(eq(automations.id, automationId))
    .returning();
  if (automation) {
    await logActivity({
      actor: "USER",
      action: "AUTOMATION_DELETED",
      summary: `Automation deleted: ${automation.name}`,
    });
  }
  revalidatePath("/automations");
  redirect("/automations");
}

// -------------------------------------------------- drafts, facts, reminders

export async function approveDraft(reminderId: string): Promise<void> {
  const db = await getDb();
  const [draft] = await db
    .select()
    .from(reminders)
    .where(and(eq(reminders.id, reminderId), eq(reminders.kind, "DRAFT")));
  if (!draft || draft.status !== "PENDING" || !draft.draftText) return;
  const contact = draft.contactId ? await getContact(draft.contactId) : null;
  if (!contact?.phoneNumber) throw new Error("Draft has no valid recipient");

  // Mark done BEFORE sending so double-clicks cannot double-send; revert on failure.
  const claimed = await db
    .update(reminders)
    .set({ status: "DONE", updatedAt: sql`now()` })
    .where(and(eq(reminders.id, reminderId), eq(reminders.status, "PENDING")))
    .returning();
  if (claimed.length === 0) return;

  const result = await sendMessage({
    to: contact.phoneNumber,
    text: draft.draftText,
    sender: "USER",
    contactId: contact.id,
    automationExecutionId: draft.automationExecutionId,
  });
  if (!result.ok) {
    await db
      .update(reminders)
      .set({ status: "PENDING", updatedAt: sql`now()` })
      .where(eq(reminders.id, reminderId));
    throw new Error(result.error ?? "Send failed");
  }
  await logActivity({
    actor: "USER",
    action: "DRAFT_APPROVED",
    summary: `Approved and sent draft to ${displayName(contact)}`,
    contactId: contact.id,
  });
  revalidatePath("/");
}

export async function dismissReminder(reminderId: string): Promise<void> {
  const db = await getDb();
  await db
    .update(reminders)
    .set({ status: "DISMISSED", updatedAt: sql`now()` })
    .where(eq(reminders.id, reminderId));
  revalidatePath("/");
}

export async function completeReminder(reminderId: string): Promise<void> {
  const db = await getDb();
  const [reminder] = await db
    .update(reminders)
    .set({ status: "DONE", updatedAt: sql`now()` })
    .where(eq(reminders.id, reminderId))
    .returning();
  if (reminder) {
    await logActivity({
      actor: "USER",
      action: "REMINDER_COMPLETED",
      summary: `Completed: ${reminder.title}`,
      contactId: reminder.contactId,
    });
  }
  revalidatePath("/");
}

export async function reviewFact(
  factId: string,
  decision: "CONFIRMED" | "DISMISSED",
): Promise<void> {
  const db = await getDb();
  const [fact] = await db
    .update(contactFacts)
    .set({ status: decision, updatedAt: sql`now()` })
    .where(eq(contactFacts.id, factId))
    .returning();
  if (fact) {
    await logActivity({
      actor: "USER",
      action: decision === "CONFIRMED" ? "FACT_CONFIRMED" : "FACT_DISMISSED",
      summary: `${decision === "CONFIRMED" ? "Confirmed" : "Dismissed"} fact: ${fact.fact.slice(0, 80)}`,
      contactId: fact.contactId,
    });
  }
  revalidatePath("/");
}

export async function reviewCommitment(
  commitmentId: string,
  decision: "CONFIRMED" | "DISMISSED" | "COMPLETED",
): Promise<void> {
  const db = await getDb();
  const [commitment] = await db
    .update(commitments)
    .set({ status: decision, updatedAt: sql`now()` })
    .where(eq(commitments.id, commitmentId))
    .returning();
  if (commitment) {
    await logActivity({
      actor: "USER",
      action: `COMMITMENT_${decision}`,
      summary: `Commitment ${decision.toLowerCase()}: ${commitment.description.slice(0, 80)}`,
      contactId: commitment.contactId,
    });
  }
  revalidatePath("/");
}

export async function addFact(
  contactId: string,
  formData: FormData,
): Promise<void> {
  const fact = String(formData.get("fact") ?? "").trim();
  if (!fact) return;
  const db = await getDb();
  await db.insert(contactFacts).values({
    contactId,
    type: "OTHER",
    fact,
    status: "CONFIRMED",
    createdBy: "USER",
    confidence: 1,
  });
  await logActivity({
    actor: "USER",
    action: "FACT_ADDED",
    summary: `Added fact: ${fact.slice(0, 80)}`,
    contactId,
  });
  revalidatePath(`/people/${contactId}`);
}

export async function addReminder(
  contactId: string | null,
  formData: FormData,
): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const dueAtRaw = String(formData.get("dueAt") ?? "").trim();
  if (!title) return;
  const db = await getDb();
  await db.insert(reminders).values({
    contactId,
    kind: "REMINDER",
    title,
    dueAt: dueAtRaw ? new Date(dueAtRaw) : new Date(),
  });
  await logActivity({
    actor: "USER",
    action: "REMINDER_CREATED",
    summary: `Reminder created: ${title}`,
    contactId,
  });
  revalidatePath("/");
  if (contactId) revalidatePath(`/people/${contactId}`);
}

// ------------------------------------------------------------------ settings

export async function updateOwnerSettings(formData: FormData): Promise<void> {
  const db = await getDb();
  const name = String(formData.get("name") ?? "").trim();
  const preferredLanguage =
    String(formData.get("preferredLanguage") ?? "").trim() || "sv";
  const timezone =
    String(formData.get("timezone") ?? "").trim() || "Europe/Stockholm";
  const defaultTone = String(formData.get("defaultTone") ?? "").trim();
  const emojiUsage = String(formData.get("emojiUsage") ?? "").trim();
  const formality = String(formData.get("formality") ?? "").trim();
  const commonExpressions = String(formData.get("commonExpressions") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const [owner] = await db.select().from(users).limit(1);
  if (!owner) return;
  await db
    .update(users)
    .set({
      name: name || owner.name,
      preferredLanguage,
      timezone,
      voiceProfile: {
        ...(owner.voiceProfile ?? {}),
        ...(defaultTone ? { defaultTone } : {}),
        ...(emojiUsage ? { emojiUsage } : {}),
        ...(formality ? { formality } : {}),
        ...(commonExpressions.length > 0 ? { commonExpressions } : {}),
      },
      updatedAt: sql`now()`,
    })
    .where(eq(users.id, owner.id));
  revalidatePath("/settings");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
