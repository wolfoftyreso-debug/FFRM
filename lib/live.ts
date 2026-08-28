import "server-only";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  activityLog,
  automationExecutions,
  calls,
  conversationInsights,
  conversations,
  mediaAssets,
  messages,
  reminders,
} from "@/lib/db/schema";

/**
 * A fingerprint of everything the operational surfaces render.
 *
 * Append-only tables contribute their newest timestamp; mutable rows also
 * contribute the counters the badges are derived from, so an in-place status
 * change (a delivery report, an escalation, a voicemail marked handled) moves
 * the fingerprint even though no row was inserted. Time-dependent state — a
 * reminder that simply becomes due — is counted against the database clock, so
 * it surfaces without any write at all.
 *
 * Deletions are always owner actions, which revalidate their own paths, so the
 * fingerprint deliberately does not pay for a full `count(*)` per table.
 */
export async function getLiveVersion(): Promise<string> {
  const db = await getDb();
  const [
    message,
    conversation,
    call,
    media,
    execution,
    insight,
    reminder,
    activity,
  ] = await Promise.all([
    db
      .select({
        received: epoch(sql`max(${messages.createdAt})`),
        delivery: epoch(
          sql`max(greatest(${messages.sentAt}, ${messages.deliveredAt}, ${messages.failedAt}, ${messages.processedAt}))`,
        ),
      })
      .from(messages),
    db
      .select({
        touched: epoch(
          sql`max(greatest(${conversations.startedAt}, ${conversations.lastMessageAt}, ${conversations.lastReadAt}, ${conversations.escalationNotifiedAt}))`,
        ),
        open: sql<string>`count(*) filter (where ${conversations.status} = 'OPEN')::text`,
        escalated: sql<string>`count(*) filter (where ${conversations.status} = 'OPEN' and ${conversations.aiControlState} = 'ESCALATED')::text`,
        unread: sql<string>`count(*) filter (where ${conversations.status} = 'OPEN' and ${conversations.lastMessageAt} is not null and (${conversations.lastReadAt} is null or ${conversations.lastReadAt} < ${conversations.lastMessageAt}))::text`,
      })
      .from(conversations),
    db
      .select({
        touched: epoch(
          sql`max(greatest(${calls.createdAt}, ${calls.answeredAt}, ${calls.endedAt}, ${calls.screenedAt}, ${calls.processedAt}))`,
        ),
        voicemail: sql<string>`count(*) filter (where ${calls.state} = 'VOICEMAIL' and ${calls.aiRequiresUser})::text`,
        needsYou: sql<string>`count(*) filter (where ${calls.aiRequiresUser} and ${calls.callbackTicketId} is null)::text`,
      })
      .from(calls),
    db
      .select({ touched: epoch(sql`max(${mediaAssets.updatedAt})`) })
      .from(mediaAssets),
    db
      .select({
        touched: epoch(
          sql`max(greatest(${automationExecutions.createdAt}, ${automationExecutions.startedAt}, ${automationExecutions.completedAt}))`,
        ),
      })
      .from(automationExecutions),
    db
      .select({
        touched: epoch(sql`max(${conversationInsights.updatedAt})`),
        pending: sql<string>`count(*) filter (where ${conversationInsights.status} = 'PENDING')::text`,
      })
      .from(conversationInsights),
    db
      .select({
        touched: epoch(sql`max(${reminders.updatedAt})`),
        drafts: sql<string>`count(*) filter (where ${reminders.kind} = 'DRAFT' and ${reminders.status} = 'PENDING')::text`,
        due: sql<string>`count(*) filter (where ${reminders.status} = 'PENDING' and ${reminders.kind} <> 'DRAFT' and (${reminders.dueAt} is null or ${reminders.dueAt} <= now()))::text`,
      })
      .from(reminders),
    db
      .select({ touched: epoch(sql`max(${activityLog.createdAt})`) })
      .from(activityLog),
  ]);

  return [
    message[0]?.received,
    message[0]?.delivery,
    conversation[0]?.touched,
    conversation[0]?.open,
    conversation[0]?.escalated,
    conversation[0]?.unread,
    call[0]?.touched,
    call[0]?.voicemail,
    call[0]?.needsYou,
    media[0]?.touched,
    execution[0]?.touched,
    insight[0]?.touched,
    insight[0]?.pending,
    reminder[0]?.touched,
    reminder[0]?.drafts,
    reminder[0]?.due,
    activity[0]?.touched,
  ]
    .map((part) => part ?? "")
    .join(".");
}

/**
 * Timestamps as an epoch string: identical across the `postgres` and PGlite
 * drivers, and independent of the session time zone.
 */
function epoch(expression: ReturnType<typeof sql>) {
  return sql<string>`coalesce(extract(epoch from ${expression})::text, '')`;
}
