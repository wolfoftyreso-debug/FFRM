"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  automations,
  commitments,
  conversationInsights,
  contactFacts,
  contacts,
  conversations,
  reminders,
  users,
  type ActionType,
  type CalendarActivityKind,
  type TriggerType,
} from "@/lib/db/schema";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { normalizePhoneNumber } from "@/lib/phone";
import { logActivity } from "@/lib/activity";
import { sendMessage } from "@/lib/sms/send-message";
import { computeNextRun, occurrenceKeyFor } from "@/lib/automations/recurrence";
import { executeAutomation } from "@/lib/automations/engine";
import { destroySession } from "@/lib/auth/session";
import { getContact, displayName } from "@/lib/queries";
import { createId } from "@/lib/id";
import {
  CALENDAR_ACTIVITY_KINDS,
  calendarActivityOption,
  isCalendarSmsJob,
} from "@/lib/calendar-activities";

// ---------------------------------------------------------------- contacts

const contactSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  displayName: z.string().optional(),
  nickname: z.string().optional(),
  phoneNumber: z.string().optional(),
  email: z.string().optional(),
  birthday: z.string().optional(),
  nameDayMonth: z.string().optional(),
  nameDayDay: z.string().optional(),
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
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  interests: z.string().optional(),
  hobbies: z.string().optional(),
});

function parseContactForm(formData: FormData) {
  const raw = Object.fromEntries(formData.entries());
  const data = contactSchema.parse(raw);
  let phoneNumber: string | null = null;
  if (data.phoneNumber?.trim()) {
    phoneNumber = normalizePhoneNumber(data.phoneNumber);
    if (!phoneNumber) throw new Error("Invalid phone number");
  }
  const nameDayMonth = Number(data.nameDayMonth);
  const nameDayDay = Number(data.nameDayDay);
  const hasNameDay = !!data.nameDayMonth || !!data.nameDayDay;
  const nameDayDate = new Date(2000, nameDayMonth - 1, nameDayDay);
  const validNameDay =
    !hasNameDay ||
    (nameDayMonth >= 1 &&
      nameDayMonth <= 12 &&
      nameDayDay >= 1 &&
      nameDayDay <= 31 &&
      nameDayDate.getMonth() === nameDayMonth - 1 &&
      nameDayDate.getDate() === nameDayDay);
  if (!validNameDay) throw new Error("Choose a valid name day");
  return {
    firstName: data.firstName.trim(),
    lastName: data.lastName?.trim() || null,
    displayName: data.displayName?.trim() || null,
    nickname: data.nickname?.trim() || null,
    phoneNumber,
    email: data.email?.trim() || null,
    birthday: data.birthday?.trim() || null,
    nameDayMonth: hasNameDay ? nameDayMonth : null,
    nameDayDay: hasNameDay ? nameDayDay : null,
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
    profile: {
      ...(data.company?.trim() ? { company: data.company.trim() } : {}),
      ...(data.jobTitle?.trim() ? { jobTitle: data.jobTitle.trim() } : {}),
      ...(data.interests?.trim()
        ? {
            interests: data.interests
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          }
        : {}),
      ...(data.hobbies?.trim()
        ? {
            hobbies: data.hobbies
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean),
          }
        : {}),
    },
  };
}

export async function createContact(formData: FormData): Promise<void> {
  const db = await getDb();
  let values: ReturnType<typeof parseContactForm>;
  try {
    values = parseContactForm(formData);
  } catch {
    redirect("/people/new?error=invalid");
  }
  const [owner] = await db.select().from(users).limit(1);
  if (!owner) throw new Error("No owner user exists; run the seed script");
  if (values.phoneNumber) {
    const [duplicate] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.userId, owner.id),
          eq(contacts.phoneNumber, values.phoneNumber),
        ),
      )
      .limit(1);
    if (duplicate) redirect("/people/new?error=phone-exists");
  }
  let created: typeof contacts.$inferSelect;
  try {
    [created] = await db
      .insert(contacts)
      .values({ ...values, userId: owner.id })
      .returning();
  } catch {
    redirect("/people/new?error=save");
  }
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
  let values: ReturnType<typeof parseContactForm>;
  try {
    values = parseContactForm(formData);
  } catch {
    redirect(`/people/${contactId}/edit?error=invalid`);
  }
  if (values.phoneNumber) {
    const [duplicate] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(
          eq(contacts.phoneNumber, values.phoneNumber),
          ne(contacts.id, contactId),
        ),
      )
      .limit(1);
    if (duplicate) {
      redirect(`/people/${contactId}/edit?error=phone-exists`);
    }
  }
  try {
    await db
      .update(contacts)
      .set({ ...values, updatedAt: sql`now()` })
      .where(eq(contacts.id, contactId));
  } catch {
    redirect(`/people/${contactId}/edit?error=save`);
  }
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
  revalidatePath(`/messages/${conversationId}`);
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
  revalidatePath(`/messages/${conversationId}`);
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
  revalidatePath(`/messages/${conversationId}`);
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
  revalidatePath("/messages");
  redirect("/messages");
}

export async function reopenConversation(conversationId: string): Promise<void> {
  const db = await getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (!conversation) return;
  // Close any other OPEN thread for this contact/peer before reopening, so
  // the partial unique index remains valid.
  await db
    .update(conversations)
    .set({ status: "CLOSED" })
    .where(
      and(
        conversation.contactId
          ? eq(conversations.contactId, conversation.contactId)
          : eq(conversations.peerNumber, conversation.peerNumber!),
        eq(conversations.status, "OPEN"),
      ),
    );
  await db
    .update(conversations)
    .set({ status: "OPEN", aiControlState: "USER" })
    .where(eq(conversations.id, conversationId));
  await logActivity({
    actor: "USER",
    action: "CONVERSATION_REOPENED",
    summary: "Conversation reopened",
    contactId: conversation.contactId,
    conversationId,
  });
  revalidatePath(`/messages/${conversationId}`);
}

export async function messageContact(contactId: string): Promise<void> {
  const contact = await getContact(contactId);
  if (!contact?.phoneNumber) throw new Error("Contact has no phone number");
  const { getOrCreateConversation } = await import("@/lib/sms/send-message");
  const conversationId = await getOrCreateConversation(
    contact.id,
    contact.phoneNumber,
  );
  redirect(`/messages/${conversationId}`);
}

export async function startManualConversation(formData: FormData): Promise<void> {
  const raw = String(formData.get("phoneNumber") ?? "");
  const phoneNumber = normalizePhoneNumber(raw);
  if (!phoneNumber) redirect("/messages/new?error=invalid-phone");
  const db = await getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, phoneNumber))
    .limit(1);
  const { getOrCreateConversation } = await import("@/lib/sms/send-message");
  const conversationId = await getOrCreateConversation(
    contact?.id ?? null,
    phoneNumber,
  );
  redirect(`/messages/${conversationId}`);
}

async function sendManualReply(
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
  revalidatePath(`/messages/${conversationId}`);
}

/** Unified composer action: text-only → SMS; image attached → MMS. */
export async function sendConversationMessage(
  conversationId: string,
  formData: FormData,
): Promise<void> {
  const text = String(formData.get("text") ?? "").trim();
  const image = formData.get("image");
  const hasImage = image !== null && typeof image !== "string" && image.size > 0;
  if (!text && !hasImage) return;

  if (!hasImage) {
    await sendManualReply(conversationId, formData);
    await markSentInsightActioned(formData);
    return;
  }
  if (image === null || typeof image === "string") return;

  const db = await getDb();
  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId));
  if (!conv) throw new Error("Conversation not found");
  const contact = conv.contactId ? await getContact(conv.contactId) : null;
  const to = contact?.phoneNumber ?? conv.peerNumber;
  if (!to) throw new Error("Conversation has no recipient number");

  // Sending anything manually transfers control to the user first.
  if (conv.aiControlState !== "USER") {
    await db
      .update(conversations)
      .set({ aiControlState: "USER" })
      .where(eq(conversations.id, conversationId));
    await logActivity({
      actor: "USER",
      action: "TAKEOVER",
      summary: "User took over by sending an MMS",
      contactId: conv.contactId,
      conversationId,
    });
  }

  const { sendMediaMessage } = await import("@/lib/mms/send-message");
  await sendMediaMessage({
    to,
    text,
    image: new Uint8Array(await image.arrayBuffer()),
    sender: "USER",
    contactId: conv.contactId,
    conversationId,
  });
  await markSentInsightActioned(formData);
  revalidatePath(`/messages/${conversationId}`);
}

async function markSentInsightActioned(formData: FormData): Promise<void> {
  const insightId = String(formData.get("insightId") ?? "");
  if (!insightId) return;
  const db = await getDb();
  await db
    .update(conversationInsights)
    .set({
      status: "ACTIONED",
      actionType: "SMS",
      handledAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversationInsights.id, insightId),
        eq(conversationInsights.status, "PENDING"),
      ),
    );
  revalidatePath("/review");
}

export async function createBroadcastCampaign(formData: FormData): Promise<void> {
  const { createBroadcastCampaign: saveCampaign } = await import(
    "@/lib/sms/campaign"
  );
  const created = await saveCampaign({
    templateText: String(formData.get("text") ?? ""),
    personalized: formData.get("personalized") === "1",
    contactIds: formData.getAll("contactId").map(String),
    importedText: String(formData.get("importedList") ?? ""),
  });
  revalidatePath("/messages");
  redirect(`/messages/broadcast/${created.campaignId}`);
}

export async function reviewInsight(
  insightId: string,
  decision: "HANDLED" | "DISMISSED",
): Promise<void> {
  const db = await getDb();
  const [row] = await db
    .update(conversationInsights)
    .set({
      status: decision,
      handledAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(conversationInsights.id, insightId),
        eq(conversationInsights.status, "PENDING"),
      ),
    )
    .returning();
  if (row) {
    await logActivity({
      actor: "USER",
      action: `INSIGHT_${decision}`,
      summary: `${decision === "HANDLED" ? "Handled" : "Dismissed"} quote: ${row.summary.slice(0, 80)}`,
      contactId: row.contactId,
      conversationId: row.conversationId,
      entityType: "conversationInsight",
      entityId: row.id,
    });
  }
  revalidatePath("/review");
  revalidatePath("/notifications");
}

export async function createTicketFromInsight(
  insightId: string,
  formData: FormData,
): Promise<void> {
  const db = await getDb();
  const [insight] = await db
    .select()
    .from(conversationInsights)
    .where(eq(conversationInsights.id, insightId))
    .limit(1);
  if (!insight || insight.status !== "PENDING") return;

  const title = String(formData.get("title") ?? "").trim() || insight.summary;
  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  const [ticket] = await db
    .insert(reminders)
    .values({
      contactId: insight.contactId,
      kind: "TASK",
      title,
      description: insight.quote,
      dueAt: dueRaw ? new Date(dueRaw) : null,
      priority: String(formData.get("priority") ?? "MEDIUM"),
      assignee: String(formData.get("assignee") ?? "").trim() || null,
      sourceInsightId: insight.id,
    })
    .returning();
  await db
    .update(conversationInsights)
    .set({
      status: "ACTIONED",
      actionType: "TICKET",
      actionEntityId: ticket.id,
      handledAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(conversationInsights.id, insightId));
  await logActivity({
    actor: "USER",
    action: "TICKET_CREATED",
    summary: `Ticket created: ${title}`,
    contactId: insight.contactId,
    entityType: "reminder",
    entityId: ticket.id,
  });
  revalidatePath("/review");
  revalidatePath("/tasks");
  redirect(`/tasks?created=${ticket.id}`);
}

export async function createCalendarFromInsight(
  insightId: string,
  formData: FormData,
): Promise<void> {
  const db = await getDb();
  const [insight] = await db
    .select()
    .from(conversationInsights)
    .where(eq(conversationInsights.id, insightId))
    .limit(1);
  if (!insight) return;
  const title = String(formData.get("title") ?? "").trim() || insight.summary;
  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  if (!dueRaw) throw new Error("Choose a date and time");
  const [event] = await db
    .insert(reminders)
    .values({
      contactId: insight.contactId,
      kind: "EVENT",
      title,
      description: insight.quote,
      dueAt: new Date(dueRaw),
      sourceInsightId: insight.id,
    })
    .returning();
  await db
    .update(conversationInsights)
    .set({
      status: "ACTIONED",
      actionType: "CALENDAR",
      actionEntityId: event.id,
      handledAt: new Date(),
      updatedAt: sql`now()`,
    })
    .where(eq(conversationInsights.id, insightId));
  revalidatePath("/calendar");
  revalidatePath("/review");
  redirect("/calendar");
}

export async function addTask(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  if (!title) throw new Error("Write a task title");
  const db = await getDb();
  const dueRaw = String(formData.get("dueAt") ?? "").trim();
  await db.insert(reminders).values({
    contactId: String(formData.get("contactId") ?? "") || null,
    kind: "TASK",
    title,
    description: String(formData.get("description") ?? "").trim() || null,
    dueAt: dueRaw ? new Date(dueRaw) : null,
    priority: String(formData.get("priority") ?? "MEDIUM"),
    assignee: String(formData.get("assignee") ?? "").trim() || null,
  });
  revalidatePath("/tasks");
}

// ---------------------------------------------------- calendar activities

const calendarActivitySchema = z.object({
  eventKind: z.enum(CALENDAR_ACTIVITY_KINDS),
  contactId: z.string().min(1),
  title: z.string().optional(),
  date: z.iso.date(),
  time: z.string().regex(/^\d{2}:\d{2}$/),
  recurring: z.string().optional(),
  randomMinute: z.string().optional(),
  instruction: z.string().max(2_000).optional(),
});

function parseCalendarActivity(
  formData: FormData,
  randomMinuteSeed = createId(),
) {
  const input = calendarActivitySchema.parse(
    Object.fromEntries(formData.entries()),
  );
  const option = calendarActivityOption(
    input.eventKind as CalendarActivityKind,
  );
  return {
    input,
    option,
    triggerConfig: {
      date: input.date,
      time: input.time,
      yearly: input.recurring === "1",
      eventKind: input.eventKind as CalendarActivityKind,
      randomMinute: input.randomMinute === "1",
      randomMinuteSeed,
    },
  };
}

export async function createCalendarActivity(
  formData: FormData,
): Promise<void> {
  const db = await getDb();
  const parsed = parseCalendarActivity(formData);
  const contact = await getContact(parsed.input.contactId);
  if (!contact) throw new Error("Choose a contact");
  if (!contact.phoneNumber) throw new Error("Contact needs a phone number");
  await syncContactSpecialDate(
    contact.id,
    parsed.input.eventKind,
    parsed.input.date,
  );
  const name =
    parsed.input.title?.trim() ||
    `${parsed.option.label} – ${displayName(contact)}`;
  const nextRunAt = computeNextRun({
    triggerType: "ANNIVERSARY",
    triggerConfig: parsed.triggerConfig,
    contact,
    after: new Date(),
  });
  if (!nextRunAt) throw new Error("Choose a future date");
  const [created] = await db
    .insert(automations)
    .values({
      name,
      description: `${parsed.option.label} i kalendern`,
      triggerType: "ANNIVERSARY",
      triggerConfig: parsed.triggerConfig,
      actionType: "GENERATE_DRAFT",
      actionConfig: {
        purpose: parsed.option.purpose,
        instruction: parsed.input.instruction?.trim() || undefined,
      },
      contactId: contact.id,
      autonomyLevel: 2,
      nextRunAt,
    })
    .returning();
  await logActivity({
    actor: "USER",
    action: "CALENDAR_ACTIVITY_CREATED",
    summary: `Calendar activity created: ${name}`,
    contactId: contact.id,
    entityType: "automation",
    entityId: created.id,
  });
  revalidatePath("/calendar");
  redirect(`/calendar/${created.id}`);
}

export async function updateCalendarActivity(
  automationId: string,
  formData: FormData,
): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId))
    .limit(1);
  if (!existing || !isCalendarSmsJob(existing)) {
    throw new Error("Calendar activity not found");
  }
  const parsed = parseCalendarActivity(
    formData,
    existing.triggerConfig.randomMinuteSeed,
  );
  const contact = await getContact(parsed.input.contactId);
  if (!contact) throw new Error("Choose a contact");
  if (!contact.phoneNumber) throw new Error("Contact needs a phone number");
  await syncContactSpecialDate(
    contact.id,
    parsed.input.eventKind,
    parsed.input.date,
  );
  const name =
    parsed.input.title?.trim() ||
    `${parsed.option.label} – ${displayName(contact)}`;
  const nextRunAt = computeNextRun({
    triggerType: "ANNIVERSARY",
    triggerConfig: parsed.triggerConfig,
    contact,
    after: new Date(),
  });
  if (!nextRunAt) throw new Error("Choose a future date");
  await db
    .update(automations)
    .set({
      name,
      description: `${parsed.option.label} i kalendern`,
      triggerType: "ANNIVERSARY",
      triggerConfig: parsed.triggerConfig,
      actionType: "GENERATE_DRAFT",
      actionConfig: {
        purpose: parsed.option.purpose,
        instruction: parsed.input.instruction?.trim() || undefined,
      },
      contactId: contact.id,
      autonomyLevel: 2,
      nextRunAt,
      updatedAt: sql`now()`,
    })
    .where(eq(automations.id, automationId));
  await logActivity({
    actor: "USER",
    action: "CALENDAR_ACTIVITY_UPDATED",
    summary: `Calendar activity updated: ${name}`,
    contactId: contact.id,
    entityType: "automation",
    entityId: automationId,
  });
  revalidatePath("/calendar");
  revalidatePath(`/calendar/${automationId}`);
  redirect(`/calendar/${automationId}`);
}

export async function deleteCalendarActivity(
  automationId: string,
): Promise<void> {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, automationId))
    .limit(1);
  if (!existing || !isCalendarSmsJob(existing)) return;
  await db.delete(automations).where(eq(automations.id, automationId));
  await logActivity({
    actor: "USER",
    action: "CALENDAR_ACTIVITY_DELETED",
    summary: `Calendar activity deleted: ${existing.name}`,
    contactId: existing.contactId,
    entityType: "automation",
    entityId: existing.id,
  });
  revalidatePath("/calendar");
  redirect("/calendar");
}

async function syncContactSpecialDate(
  contactId: string,
  eventKind: CalendarActivityKind,
  date: string,
): Promise<void> {
  const db = await getDb();
  if (eventKind === "BIRTHDAY") {
    await db
      .update(contacts)
      .set({ birthday: date, updatedAt: sql`now()` })
      .where(eq(contacts.id, contactId));
  } else if (eventKind === "NAME_DAY") {
    const [, month, day] = date.split("-").map(Number);
    await db
      .update(contacts)
      .set({ nameDayMonth: month, nameDayDay: day, updatedAt: sql`now()` })
      .where(eq(contacts.id, contactId));
  }
}

// -------------------------------------------------------------- automations

const automationSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  triggerType: z.enum([
    "DATE",
    "BIRTHDAY",
    "NAME_DAY",
    "ANNIVERSARY",
    "CRON",
    "INTERVAL",
    "NO_CONTACT_FOR",
    "INCOMING_SMS",
    "MANUAL",
  ]),
  actionType: z.enum([
    "SEND_SMS",
    "GENERATE_SMS",
    "GENERATE_DRAFT",
    "REMIND_USER",
    "CREATE_TASK",
    "CREATE_CALENDAR_EVENT",
    "AI_EVALUATE",
    "ESCALATE",
    "UPDATE_CONTACT",
    "LOG_EVENT",
    "EXTRACT_INSIGHTS",
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
  actionField: z.enum(["notes", "importance", "relationshipType"]).optional(),
  actionValue: z.string().optional(),
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
      ...(data.actionField && data.actionValue?.trim()
        ? { fields: { [data.actionField]: data.actionValue.trim() } }
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
  revalidatePath(`/calendar/${automationId}`);
  revalidatePath("/calendar");
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

// ------------------------------------------------- relationship ontology & style

export async function proposeRelationshipFromDescription(
  contactId: string,
  formData: FormData,
): Promise<void> {
  const description = String(formData.get("description") ?? "").trim();
  if (!description) return;
  const contact = await getContact(contactId);
  if (!contact) return;
  const { proposeRelationship } = await import("@/lib/ai/relationship");
  const { proposal } = await proposeRelationship({
    contactName: displayName(contact),
    description,
    preferredLanguage: contact.preferredLanguage,
  });
  const db = await getDb();
  await db
    .update(contacts)
    .set({
      relationshipDescription: description,
      relationshipLabel: proposal.label,
      relationshipVector: proposal.vector,
      confidenceEnvelope: proposal.suggestedEnvelope,
      updatedAt: sql`now()`,
    })
    .where(eq(contacts.id, contactId));
  await logActivity({
    actor: "AI",
    action: "RELATIONSHIP_PROPOSED",
    summary: `Relationship ontology proposed for ${displayName(contact)}: ${proposal.label}`,
    contactId,
    detail: { vector: proposal.vector, reasoning: proposal.reasoning },
  });
  revalidatePath(`/people/${contactId}`);
}

const VECTOR_KEYS = [
  "personalCloseness",
  "professionalRelevance",
  "formality",
  "trust",
  "humorTolerance",
  "sensitiveTopicAccess",
  "autonomousReplyFreedom",
  "proactiveContactDesired",
  "callThroughPriority",
  "privacySensitivity",
] as const;

const ENVELOPE_KEYS = [
  "SMALL_TALK",
  "JOKES",
  "GENERIC_LIFE_QUESTIONS",
  "KNOWN_SHARED_TOPICS",
  "SUGGEST_MEETING",
  "AGREE_SPECIFIC_MEETING",
  "MONEY_OR_PAYMENT",
  "PRIVATE_INFORMATION",
  "FACTUAL_COMMITMENT",
  "WORK_DECISION",
  "CONFLICT_OR_EMOTION",
] as const;

export async function updateAdvancedRelationship(
  contactId: string,
  formData: FormData,
): Promise<void> {
  const db = await getDb();
  const vector: Record<string, number> = {};
  for (const key of VECTOR_KEYS) {
    const raw = formData.get(`vector_${key}`);
    if (raw !== null && String(raw).trim() !== "") {
      vector[key] = Math.min(100, Math.max(0, Number(raw) || 0));
    }
  }
  const envelope: Record<string, string> = {};
  for (const key of ENVELOPE_KEYS) {
    const raw = String(formData.get(`envelope_${key}`) ?? "");
    if (raw === "AUTO" || raw === "ESCALATE" || raw === "BLOCK") {
      envelope[key] = raw;
    }
  }
  const label = String(formData.get("relationshipLabel") ?? "").trim();
  const callPolicy = String(formData.get("callPolicy") ?? "INHERIT");
  await db
    .update(contacts)
    .set({
      relationshipLabel: label || null,
      relationshipVector: vector as typeof contacts.$inferInsert.relationshipVector,
      confidenceEnvelope: envelope as typeof contacts.$inferInsert.confidenceEnvelope,
      callPolicy: callPolicy as typeof contacts.$inferInsert.callPolicy,
      updatedAt: sql`now()`,
    })
    .where(eq(contacts.id, contactId));
  await logActivity({
    actor: "USER",
    action: "RELATIONSHIP_UPDATED",
    summary: "Advanced relationship settings updated",
    contactId,
  });
  revalidatePath(`/people/${contactId}`);
}

const MAX_SCREENSHOTS = 10;
const MAX_SCREENSHOT_BYTES = 4 * 1024 * 1024;

export async function uploadStyleScreenshots(
  contactId: string,
  formData: FormData,
): Promise<void> {
  const contact = await getContact(contactId);
  if (!contact) return;
  const db = await getDb();
  const { contactMedia } = await import("@/lib/db/schema");
  const { sanitizeImage } = await import("@/lib/media/image");

  const files = formData
    .getAll("screenshots")
    .filter((f): f is File => typeof f !== "string" && f.size > 0)
    .slice(0, MAX_SCREENSHOTS);
  if (files.length === 0) return;

  let stored = 0;
  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      throw new Error(`${file.name} is not an image`);
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      throw new Error(`${file.name} exceeds the 4MB screenshot limit`);
    }
    const clean = await sanitizeImage(
      new Uint8Array(await file.arrayBuffer()),
      MAX_SCREENSHOT_BYTES,
    );
    // Provenance is sanitized to safe image bytes before persistence.
    await db.insert(contactMedia).values({
      contactId,
      kind: "STYLE_SCREENSHOT",
      mimeType: clean.mimeType,
      dataBase64: clean.data.toString("base64"),
      analysisStatus: "PENDING",
    });
    stored++;
  }
  if (stored === 0) throw new Error("No valid screenshots were uploaded");
  const { processContactStyle } = await import("@/lib/ai/process-style");
  await processContactStyle(contactId);
  revalidatePath(`/people/${contactId}`);
}

export async function retryStyleExtraction(contactId: string): Promise<void> {
  const db = await getDb();
  const { contactMedia } = await import("@/lib/db/schema");
  await db
    .update(contactMedia)
    .set({ analysisStatus: "PENDING", retryCount: 0, analysisError: null })
    .where(eq(contactMedia.contactId, contactId));
  const { processContactStyle } = await import("@/lib/ai/process-style");
  await processContactStyle(contactId);
  revalidatePath(`/people/${contactId}`);
}

// ----------------------------------------------------------------- phone

export async function callContact(contactId: string): Promise<void> {
  const contact = await getContact(contactId);
  if (!contact) return;
  const { initiateCallback } = await import("@/lib/voice/service");
  await initiateCallback(contact);
  revalidatePath("/phone");
}

export async function callNumber(formData: FormData): Promise<void> {
  const phoneNumber = normalizePhoneNumber(
    String(formData.get("phoneNumber") ?? ""),
  );
  if (!phoneNumber) redirect("/phone?dial=1&error=invalid-phone");
  const db = await getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, phoneNumber))
    .limit(1);
  const { initiateCallbackToNumber } = await import("@/lib/voice/service");
  await initiateCallbackToNumber({ phoneNumber, contact: contact ?? null });
  revalidatePath("/phone");
  redirect("/phone?started=1");
}

export async function blockNumber(phoneNumber: string): Promise<void> {
  const db = await getDb();
  const { blockedNumbers } = await import("@/lib/db/schema");
  await db
    .insert(blockedNumbers)
    .values({ phoneNumber, reason: "Blocked from phone view" })
    .onConflictDoNothing();
  await logActivity({
    actor: "USER",
    action: "NUMBER_BLOCKED",
    summary: `Blocked ${phoneNumber}`,
  });
  revalidatePath("/phone");
  revalidatePath("/settings");
}

export async function unblockNumber(phoneNumber: string): Promise<void> {
  const db = await getDb();
  const { blockedNumbers } = await import("@/lib/db/schema");
  await db.delete(blockedNumbers).where(eq(blockedNumbers.phoneNumber, phoneNumber));
  await logActivity({
    actor: "USER",
    action: "NUMBER_UNBLOCKED",
    summary: `Unblocked ${phoneNumber}`,
  });
  revalidatePath("/phone");
  revalidatePath("/settings");
}

export async function markCallHandled(callId: string): Promise<void> {
  const db = await getDb();
  const { calls } = await import("@/lib/db/schema");
  const [call] = await db
    .update(calls)
    .set({ aiRequiresUser: false })
    .where(eq(calls.id, callId))
    .returning();
  if (call) {
    await logActivity({
      actor: "USER",
      action: "CALL_HANDLED",
      summary: "Call/voicemail marked handled",
      contactId: call.contactId,
      entityType: "call",
      entityId: call.id,
    });
  }
  revalidatePath("/phone");
}

// ----------------------------------------------------------------- assistant

export async function sendAssistantMessage(formData: FormData): Promise<void> {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) return;
  const { runAssistantTurn } = await import("@/lib/ai/assistant");
  await runAssistantTurn(text);
  revalidatePath("/chat");
}

// ----------------------------------------------------------- provider settings

export async function testElksSettings(): Promise<void> {
  const { testElksConnection } = await import("@/lib/providers/elks46");
  const { updateProviderTestStatus } = await import("@/lib/providers/config");
  try {
    await testElksConnection();
    await updateProviderTestStatus("46elks", true);
  } catch (error) {
    await updateProviderTestStatus("46elks", false, error);
  }
  revalidatePath("/settings");
}

export async function testElevenLabsSettings(): Promise<void> {
  const { listElevenLabsVoices } = await import(
    "@/lib/providers/elevenlabs"
  );
  const { updateProviderTestStatus } = await import("@/lib/providers/config");
  try {
    await listElevenLabsVoices();
    await updateProviderTestStatus("elevenlabs", true);
  } catch (error) {
    await updateProviderTestStatus("elevenlabs", false, error);
  }
  revalidatePath("/settings");
}

export async function generateElevenLabsGreetings(): Promise<void> {
  const db = await getDb();
  const { audioAssets } = await import("@/lib/db/schema");
  const {
    getElevenLabsConfig,
    getProviderStatus,
    saveProviderConfig,
  } = await import("@/lib/providers/config");
  const { generateElevenLabsSpeech } = await import(
    "@/lib/providers/elevenlabs"
  );
  const config = await getElevenLabsConfig();
  const [voicemail, screening] = await Promise.all([
    generateElevenLabsSpeech(config.voicemailText),
    generateElevenLabsSpeech(config.screeningText),
  ]);
  const [voicemailAsset, screeningAsset] = await db.transaction(async (tx) => {
    const [vm] = await tx
      .insert(audioAssets)
      .values({
        provider: "elevenlabs",
        purpose: "VOICEMAIL_GREETING",
        mimeType: voicemail.mimeType,
        dataBase64: Buffer.from(voicemail.data).toString("base64"),
        byteSize: voicemail.data.byteLength,
        sourceText: config.voicemailText,
      })
      .returning();
    const [screen] = await tx
      .insert(audioAssets)
      .values({
        provider: "elevenlabs",
        purpose: "SCREEN_GREETING",
        mimeType: screening.mimeType,
        dataBase64: Buffer.from(screening.data).toString("base64"),
        byteSize: screening.data.byteLength,
        sourceText: config.screeningText,
      })
      .returning();
    return [vm, screen];
  });
  const current =
    (await getProviderStatus()).elevenlabs?.publicConfig ?? {};
  await saveProviderConfig("elevenlabs", {}, {
    ...current,
    voicemailAudioId: voicemailAsset.id,
    screeningAudioId: screeningAsset.id,
  });
  await logActivity({
    actor: "USER",
    action: "VOICE_GREETINGS_GENERATED",
    summary: "ElevenLabs voicemail and screening greetings generated",
  });
  revalidatePath("/settings");
}

export async function removeProviderConfig(
  provider: "46elks" | "elevenlabs",
): Promise<void> {
  const db = await getDb();
  const { audioAssets, providerSettings } = await import("@/lib/db/schema");
  await db.transaction(async (tx) => {
    await tx
      .delete(providerSettings)
      .where(eq(providerSettings.provider, provider));
    if (provider === "elevenlabs") {
      await tx.delete(audioAssets).where(eq(audioAssets.provider, provider));
    }
  });
  await logActivity({
    actor: "USER",
    action: "PROVIDER_REMOVED",
    summary: `${provider} provider configuration removed`,
  });
  revalidatePath("/settings");
}

export async function logout(): Promise<void> {
  await destroySession();
  redirect("/login");
}
