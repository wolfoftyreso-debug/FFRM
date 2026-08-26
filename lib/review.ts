import "server-only";
import { and, desc, eq, isNull, lte, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  calls,
  contacts,
  conversationInsights,
  conversations,
  reminders,
} from "@/lib/db/schema";

export async function listPendingInsights(limit = 100) {
  const db = await getDb();
  return db
    .select({
      insight: conversationInsights,
      contact: {
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        displayName: contacts.displayName,
        nickname: contacts.nickname,
      },
    })
    .from(conversationInsights)
    .leftJoin(contacts, eq(conversationInsights.contactId, contacts.id))
    .where(eq(conversationInsights.status, "PENDING"))
    .orderBy(desc(conversationInsights.createdAt))
    .limit(limit);
}

export async function getInsight(id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(conversationInsights)
    .where(eq(conversationInsights.id, id))
    .limit(1);
  return row ?? null;
}

export async function getCallDetail(id: string) {
  const db = await getDb();
  const [row] = await db
    .select({ call: calls, contact: contacts })
    .from(calls)
    .leftJoin(contacts, eq(calls.contactId, contacts.id))
    .where(eq(calls.id, id))
    .limit(1);
  return row ?? null;
}

export async function listTickets(view: "open" | "done" = "open") {
  const db = await getDb();
  return db
    .select({ ticket: reminders, contact: contacts })
    .from(reminders)
    .leftJoin(contacts, eq(reminders.contactId, contacts.id))
    .where(
      and(
        eq(reminders.kind, "TASK"),
        view === "done"
          ? eq(reminders.status, "DONE")
          : eq(reminders.status, "PENDING"),
      ),
    )
    .orderBy(desc(reminders.createdAt))
    .limit(200);
}

export async function getNotificationCount(now = new Date()): Promise<number> {
  const db = await getDb();
  const [insights, due, voicemail, escalated] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)` })
      .from(conversationInsights)
      .where(eq(conversationInsights.status, "PENDING")),
    db
      .select({ count: sql<number>`count(*)` })
      .from(reminders)
      .where(
        and(
          eq(reminders.status, "PENDING"),
          ne(reminders.kind, "DRAFT"),
          or(isNull(reminders.dueAt), lte(reminders.dueAt, now)),
        ),
      ),
    db
      .select({ count: sql<number>`count(*)` })
      .from(calls)
      .where(eq(calls.aiRequiresUser, true)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(conversations)
      .where(
        and(
          eq(conversations.status, "OPEN"),
          eq(conversations.aiControlState, "ESCALATED"),
        ),
      ),
  ]);
  return [insights, due, voicemail, escalated].reduce(
    (total, rows) => total + Number(rows[0]?.count ?? 0),
    0,
  );
}

