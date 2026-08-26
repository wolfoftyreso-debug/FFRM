import { getDb } from "@/lib/db";
import {
  activityLog,
  assistantMessages,
  automationExecutions,
  automations,
  calls,
  commitments,
  contactFacts,
  contactMedia,
  contacts,
  conversations,
  mediaAssets,
  messages,
  reminders,
  users,
  type Contact,
} from "@/lib/db/schema";
import { and, asc, desc, eq, gte, isNotNull, lte, ne, or, sql } from "drizzle-orm";
import { nextYearlyOccurrence } from "@/lib/automations/recurrence";
import { defaultTimezone } from "@/lib/env";

export async function getOwner() {
  const db = await getDb();
  const [user] = await db.select().from(users).limit(1);
  return user ?? null;
}

export async function listContacts() {
  const db = await getDb();
  return db
    .select()
    .from(contacts)
    .where(sql`${contacts.archivedAt} is null`)
    .orderBy(asc(contacts.firstName));
}

export async function getContact(id: string) {
  const db = await getDb();
  const [contact] = await db.select().from(contacts).where(eq(contacts.id, id));
  return contact ?? null;
}

export interface ConversationListItem {
  id: string;
  contactName: string;
  contactId: string | null;
  peerNumber: string | null;
  aiControlState: string;
  status: string;
  lastMessageAt: Date | null;
  lastMessageText: string | null;
  escalationReason: string | null;
}

export function conversationStateLabel(state: string, status: string): string {
  if (status === "CLOSED") return "CLOSED";
  switch (state) {
    case "ESCALATED":
      return "NEEDS YOU";
    case "USER":
      return "YOU HANDLING";
    case "PAUSED":
      return "PAUSED";
    default:
      return "AI HANDLING";
  }
}

export async function listConversations(): Promise<ConversationListItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      conversation: conversations,
      contact: contacts,
    })
    .from(conversations)
    .leftJoin(contacts, eq(conversations.contactId, contacts.id))
    .orderBy(desc(conversations.lastMessageAt));

  const result: ConversationListItem[] = [];
  for (const row of rows) {
    const lastMessage = await db
      .select({ text: messages.text, contentType: messages.contentType })
      .from(messages)
      .where(eq(messages.conversationId, row.conversation.id))
      .orderBy(desc(messages.createdAt))
      .limit(1);
    result.push({
      id: row.conversation.id,
      contactId: row.contact?.id ?? null,
      contactName: row.contact
        ? displayName(row.contact)
        : (row.conversation.peerNumber ?? "Unknown"),
      peerNumber: row.conversation.peerNumber,
      aiControlState: row.conversation.aiControlState,
      status: row.conversation.status,
      lastMessageAt: row.conversation.lastMessageAt,
      lastMessageText:
        lastMessage[0]?.text ||
        (lastMessage[0]?.contentType === "IMAGE" ||
        lastMessage[0]?.contentType === "TEXT_AND_IMAGE"
          ? "📷 Photo"
          : null),
      escalationReason: row.conversation.escalationReason,
    });
  }
  return result;
}

export async function getConversationDetail(id: string) {
  const db = await getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, id));
  if (!conversation) return null;
  const contact = conversation.contactId
    ? await getContact(conversation.contactId)
    : null;
  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.conversationId, id))
    .orderBy(asc(messages.createdAt));
  const assetRows = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.conversationId, id))
    .orderBy(asc(mediaAssets.receivedAt));
  const facts = contact
    ? await db
        .select()
        .from(contactFacts)
        .where(
          and(
            eq(contactFacts.contactId, contact.id),
            ne(contactFacts.status, "DISMISSED"),
          ),
        )
        .orderBy(desc(contactFacts.createdAt))
        .limit(10)
    : [];
  return {
    conversation,
    contact,
    messages: messageRows,
    facts,
    mediaByMessage: Object.groupBy(assetRows, (a) => a.messageId),
  };
}

export function displayName(contact: Contact): string {
  return (
    contact.displayName ??
    contact.nickname ??
    [contact.firstName, contact.lastName].filter(Boolean).join(" ")
  );
}

export async function getContactDetail(id: string) {
  const db = await getDb();
  const contact = await getContact(id);
  if (!contact) return null;
  const facts = await db
    .select()
    .from(contactFacts)
    .where(eq(contactFacts.contactId, id))
    .orderBy(desc(contactFacts.createdAt));
  const contactCommitments = await db
    .select()
    .from(commitments)
    .where(eq(commitments.contactId, id))
    .orderBy(desc(commitments.createdAt));
  const contactAutomations = await db
    .select()
    .from(automations)
    .where(eq(automations.contactId, id))
    .orderBy(asc(automations.name));
  const contactConversations = await db
    .select()
    .from(conversations)
    .where(eq(conversations.contactId, id))
    .orderBy(desc(conversations.lastMessageAt));

  // Timeline: messages + activity entries merged chronologically.
  const messageRows = await db
    .select()
    .from(messages)
    .where(eq(messages.contactId, id))
    .orderBy(desc(messages.createdAt))
    .limit(50);
  const activityRows = await db
    .select()
    .from(activityLog)
    .where(eq(activityLog.contactId, id))
    .orderBy(desc(activityLog.createdAt))
    .limit(50);

  const timeline = [
    ...messageRows.map((m) => ({
      at: m.createdAt,
      kind:
        m.direction === "INBOUND" ? ("INCOMING_SMS" as const) : ("OUTGOING_SMS" as const),
      title:
        m.direction === "INBOUND"
          ? "Incoming SMS"
          : `Outgoing SMS${m.sender ? ` (${m.sender})` : ""}`,
      body: m.text,
      status: m.status,
    })),
    ...activityRows
      .filter((a) => a.action !== "SMS_RECEIVED" && a.action !== "SMS_SENT")
      .map((a) => ({
        at: a.createdAt,
        kind: "ACTIVITY" as const,
        title: a.action.replaceAll("_", " "),
        body: a.summary,
        status: a.actor,
      })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime());

  return {
    contact,
    facts,
    commitments: contactCommitments,
    automations: contactAutomations,
    conversations: contactConversations,
    timeline,
  };
}

export async function listAutomations() {
  const db = await getDb();
  const rows = await db
    .select({ automation: automations, contact: contacts })
    .from(automations)
    .leftJoin(contacts, eq(automations.contactId, contacts.id))
    .orderBy(asc(automations.name));
  return rows;
}

export async function getAutomationDetail(id: string) {
  const db = await getDb();
  const [automation] = await db
    .select()
    .from(automations)
    .where(eq(automations.id, id));
  if (!automation) return null;
  const contact = automation.contactId
    ? await getContact(automation.contactId)
    : null;
  const executions = await db
    .select()
    .from(automationExecutions)
    .where(eq(automationExecutions.automationId, id))
    .orderBy(desc(automationExecutions.createdAt))
    .limit(30);
  return { automation, contact, executions };
}

export async function listActivity(limit = 100) {
  const db = await getDb();
  const rows = await db
    .select({ entry: activityLog, contact: contacts })
    .from(activityLog)
    .leftJoin(contacts, eq(activityLog.contactId, contacts.id))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
  return rows;
}

export interface CalendarItem {
  at: Date;
  title: string;
  kind: "AUTOMATIC" | "HUMAN" | "COMPLETED" | "ESCALATED" | "BIRTHDAY";
  detailUrl: string | null;
  contactName: string | null;
  status?: string;
}

export async function getCalendarItems(
  rangeStart: Date,
  rangeEnd: Date,
): Promise<CalendarItem[]> {
  const db = await getDb();
  const items: CalendarItem[] = [];
  const tz = defaultTimezone();

  // Scheduled automations.
  const scheduled = await db
    .select({ automation: automations, contact: contacts })
    .from(automations)
    .leftJoin(contacts, eq(automations.contactId, contacts.id))
    .where(
      and(
        eq(automations.enabled, true),
        isNotNull(automations.nextRunAt),
        gte(automations.nextRunAt, rangeStart),
        lte(automations.nextRunAt, rangeEnd),
      ),
    );
  for (const row of scheduled) {
    items.push({
      at: row.automation.nextRunAt!,
      title: row.automation.name,
      kind: "AUTOMATIC",
      detailUrl: `/automations/${row.automation.id}`,
      contactName: row.contact ? displayName(row.contact) : null,
    });
  }

  // Past executions.
  const executed = await db
    .select({
      execution: automationExecutions,
      automation: automations,
      contact: contacts,
    })
    .from(automationExecutions)
    .innerJoin(automations, eq(automationExecutions.automationId, automations.id))
    .leftJoin(contacts, eq(automationExecutions.contactId, contacts.id))
    .where(
      and(
        gte(automationExecutions.scheduledFor, rangeStart),
        lte(automationExecutions.scheduledFor, rangeEnd),
      ),
    );
  for (const row of executed) {
    items.push({
      at: row.execution.scheduledFor,
      title: row.automation.name,
      kind: row.execution.status === "ESCALATED" ? "ESCALATED" : "COMPLETED",
      status: row.execution.status,
      detailUrl: `/automations/${row.automation.id}`,
      contactName: row.contact ? displayName(row.contact) : null,
    });
  }

  // Pending reminders / tasks / events / drafts.
  const pendingReminders = await db
    .select({ reminder: reminders, contact: contacts })
    .from(reminders)
    .leftJoin(contacts, eq(reminders.contactId, contacts.id))
    .where(
      and(
        eq(reminders.status, "PENDING"),
        isNotNull(reminders.dueAt),
        gte(reminders.dueAt, rangeStart),
        lte(reminders.dueAt, rangeEnd),
      ),
    );
  for (const row of pendingReminders) {
    items.push({
      at: row.reminder.dueAt!,
      title: row.reminder.title,
      kind: row.reminder.kind === "DRAFT" ? "ESCALATED" : "HUMAN",
      detailUrl: "/",
      contactName: row.contact ? displayName(row.contact) : null,
    });
  }

  // Confirmed commitments.
  const dueCommitments = await db
    .select({ commitment: commitments, contact: contacts })
    .from(commitments)
    .innerJoin(contacts, eq(commitments.contactId, contacts.id))
    .where(
      and(
        eq(commitments.status, "CONFIRMED"),
        isNotNull(commitments.dueAt),
        gte(commitments.dueAt, rangeStart),
        lte(commitments.dueAt, rangeEnd),
      ),
    );
  for (const row of dueCommitments) {
    items.push({
      at: row.commitment.dueAt!,
      title: `Commitment: ${row.commitment.description}`,
      kind: "HUMAN",
      detailUrl: row.contact ? `/people/${row.contact.id}` : null,
      contactName: row.contact ? displayName(row.contact) : null,
    });
  }

  // Birthdays.
  const allContacts = await db
    .select()
    .from(contacts)
    .where(and(sql`${contacts.archivedAt} is null`, isNotNull(contacts.birthday)));
  for (const c of allContacts) {
    if (!c.birthday) continue;
    const [, m, d] = c.birthday.split("-").map(Number);
    try {
      const next = nextYearlyOccurrence(
        m,
        d,
        0,
        0,
        c.timezone ?? tz,
        new Date(rangeStart.getTime() - 1),
      );
      if (next >= rangeStart && next <= rangeEnd) {
        items.push({
          at: next,
          title: `${displayName(c)}'s birthday`,
          kind: "BIRTHDAY",
          detailUrl: `/people/${c.id}`,
          contactName: displayName(c),
        });
      }
    } catch {
      // skip malformed birthdays
    }
  }

  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}

export async function getTodayData() {
  const db = await getDb();
  const now = new Date();
  const in7days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

  const escalated = (await listConversations()).filter(
    (c) => c.aiControlState === "ESCALATED" && c.status === "OPEN",
  );

  const dueReminders = await db
    .select({ reminder: reminders, contact: contacts })
    .from(reminders)
    .leftJoin(contacts, eq(reminders.contactId, contacts.id))
    .where(
      and(
        eq(reminders.status, "PENDING"),
        or(isNotNull(reminders.dueAt), sql`true`),
        lte(reminders.dueAt, endOfToday),
      ),
    )
    .orderBy(asc(reminders.dueAt))
    .limit(30);

  const upcoming = await getCalendarItems(now, in7days);

  const suggestedFacts = await db
    .select({ fact: contactFacts, contact: contacts })
    .from(contactFacts)
    .innerJoin(contacts, eq(contactFacts.contactId, contacts.id))
    .where(eq(contactFacts.status, "SUGGESTED"))
    .orderBy(desc(contactFacts.createdAt))
    .limit(10);

  const suggestedCommitments = await db
    .select({ commitment: commitments, contact: contacts })
    .from(commitments)
    .innerJoin(contacts, eq(commitments.contactId, contacts.id))
    .where(eq(commitments.status, "SUGGESTED"))
    .orderBy(desc(commitments.createdAt))
    .limit(10);

  return {
    escalated,
    dueReminders,
    upcoming: upcoming.slice(0, 12),
    suggestedFacts,
    suggestedCommitments,
  };
}

export async function listCalls(limit = 50) {
  const db = await getDb();
  return db
    .select({ call: calls, contact: contacts })
    .from(calls)
    .leftJoin(contacts, eq(calls.contactId, contacts.id))
    .orderBy(desc(calls.createdAt))
    .limit(limit);
}

export async function getAssistantHistory(limit = 40) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(assistantMessages)
    .orderBy(desc(assistantMessages.createdAt))
    .limit(limit);
  return rows.reverse();
}

export async function countStyleScreenshots(contactId: string): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(contactMedia)
    .where(eq(contactMedia.contactId, contactId));
  return Number(rows[0]?.count ?? 0);
}

export async function getAttentionSummary() {
  const db = await getDb();
  const escalated = (await listConversations()).filter(
    (c) => c.aiControlState === "ESCALATED" && c.status === "OPEN",
  );
  const drafts = await db
    .select({ count: sql<number>`count(*)` })
    .from(reminders)
    .where(and(eq(reminders.kind, "DRAFT"), eq(reminders.status, "PENDING")));
  const dueReminders = await db
    .select({ count: sql<number>`count(*)` })
    .from(reminders)
    .where(
      and(
        ne(reminders.kind, "DRAFT"),
        eq(reminders.status, "PENDING"),
        lte(reminders.dueAt, new Date()),
      ),
    );
  const unheardVoicemail = await db
    .select({ count: sql<number>`count(*)` })
    .from(calls)
    .where(and(eq(calls.state, "VOICEMAIL"), eq(calls.aiRequiresUser, true)));
  return {
    escalated,
    draftCount: Number(drafts[0]?.count ?? 0),
    dueReminderCount: Number(dueReminders[0]?.count ?? 0),
    voicemailNeedsYou: Number(unheardVoicemail[0]?.count ?? 0),
  };
}

export async function getPendingEscalationCount(): Promise<number> {
  const db = await getDb();
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(conversations)
    .where(
      and(
        eq(conversations.aiControlState, "ESCALATED"),
        eq(conversations.status, "OPEN"),
      ),
    );
  return Number(rows[0]?.count ?? 0);
}

export async function getSystemHealth() {
  const db = await getDb();
  const failedJobs = await db
    .select({ count: sql<number>`count(*)` })
    .from(automationExecutions)
    .where(eq(automationExecutions.status, "FAILED"));
  const pendingEscalations = await getPendingEscalationCount();
  return {
    failedJobs: Number(failedJobs[0]?.count ?? 0),
    pendingEscalations,
  };
}

export async function listRecentAiCalls(limit = 30) {
  const db = await getDb();
  const { aiCalls } = await import("@/lib/db/schema");
  return db.select().from(aiCalls).orderBy(desc(aiCalls.createdAt)).limit(limit);
}

export async function listOpenDrafts() {
  const db = await getDb();
  return db
    .select({ reminder: reminders, contact: contacts })
    .from(reminders)
    .leftJoin(contacts, eq(reminders.contactId, contacts.id))
    .where(and(eq(reminders.kind, "DRAFT"), eq(reminders.status, "PENDING")))
    .orderBy(desc(reminders.createdAt));
}

export async function searchContacts(query: string, filter?: string) {
  const all = await listContacts();
  const q = query.trim().toLowerCase();
  let result = all;
  if (q) {
    result = result.filter((c) =>
      [c.firstName, c.lastName, c.displayName, c.nickname, c.phoneNumber, c.email]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(q)),
    );
  }
  if (filter && filter !== "all") {
    const now = Date.now();
    if (filter === "important") {
      result = result.filter((c) => c.importance === "HIGH");
    } else if (filter === "birthday-soon") {
      result = result.filter((c) => {
        if (!c.birthday) return false;
        const [, m, d] = c.birthday.split("-").map(Number);
        try {
          const next = nextYearlyOccurrence(
            m, d, 0, 0, c.timezone ?? defaultTimezone(), new Date(),
          );
          return next.getTime() - now < 30 * 24 * 60 * 60 * 1000;
        } catch {
          return false;
        }
      });
    } else if (filter === "needs-attention") {
      result = result.filter((c) => {
        if (!c.desiredContactCadenceDays) return false;
        if (!c.lastInteractionAt) return true;
        return (
          now - c.lastInteractionAt.getTime() >
          c.desiredContactCadenceDays * 24 * 60 * 60 * 1000
        );
      });
    } else {
      result = result.filter(
        (c) => c.relationshipType.toLowerCase() === filter.toLowerCase(),
      );
    }
  }
  return result;
}

