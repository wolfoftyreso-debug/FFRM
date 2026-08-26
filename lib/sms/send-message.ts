import { getDb } from "@/lib/db";
import {
  contacts,
  conversations,
  messages,
  type Message,
} from "@/lib/db/schema";
import { getMessagingProvider } from "./provider";
import { isE164 } from "@/lib/phone";
import { requireEnv } from "@/lib/env";
import { logActivity, type Actor } from "@/lib/activity";
import { touchSystemState } from "@/lib/system-state";
import { and, eq, sql } from "drizzle-orm";

export interface SendMessageInput {
  to: string; // E.164
  text: string;
  sender: Actor; // USER | AI | SYSTEM | AUTOMATION
  contactId?: string | null;
  conversationId?: string | null;
  automationExecutionId?: string | null;
  /** Skip conversation bookkeeping (owner notifications). */
  system?: boolean;
}

export interface SendMessageResult {
  message: Message;
  ok: boolean;
  error?: string;
}

export async function getOrCreateConversation(
  contactId: string | null,
  peerNumber: string,
): Promise<string> {
  const db = await getDb();
  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        contactId
          ? eq(conversations.contactId, contactId)
          : eq(conversations.peerNumber, peerNumber),
        eq(conversations.status, "OPEN"),
      ),
    )
    .limit(1);
  if (existing[0]) return existing[0].id;
  const inserted = await db
    .insert(conversations)
    .values({ contactId, peerNumber })
    .returning({ id: conversations.id });
  return inserted[0].id;
}

/**
 * Outbound SMS service.
 *
 * The outbound record is persisted BEFORE the provider call so that a
 * provider failure never loses the communication attempt; the record is then
 * updated with the provider message id or the failure.
 */
export async function sendMessage(
  input: SendMessageInput,
): Promise<SendMessageResult> {
  const db = await getDb();

  if (!isE164(input.to)) {
    throw new Error(`Recipient is not a valid E.164 number: ${input.to}`);
  }
  const text = input.text.trim();
  if (!text) throw new Error("Message text is empty");

  const from = requireEnv("ELKS46_FROM_NUMBER");

  let conversationId = input.conversationId ?? null;
  if (!input.system && !conversationId) {
    conversationId = await getOrCreateConversation(
      input.contactId ?? null,
      input.to,
    );
  }

  const [record] = await db
    .insert(messages)
    .values({
      conversationId,
      contactId: input.contactId ?? null,
      direction: "OUTBOUND",
      provider: "46elks",
      fromNumber: from,
      toNumber: input.to,
      text,
      status: "PENDING",
      sender: input.sender,
      automationExecutionId: input.automationExecutionId ?? null,
    })
    .returning();

  try {
    const provider = await getMessagingProvider();
    const result = await provider.sendSms({ to: input.to, text });

    const [updated] = await db
      .update(messages)
      .set({
        providerMessageId: result.providerMessageId,
        status: "SENT",
        sentAt: new Date(),
      })
      .where(eq(messages.id, record.id))
      .returning();

    if (conversationId) {
      await db
        .update(conversations)
        .set({
          lastMessageAt: new Date(),
          lastUserMessageAt: new Date(),
        })
        .where(eq(conversations.id, conversationId));
    }
    if (input.contactId) {
      await db
        .update(contacts)
        .set({ lastInteractionAt: new Date(), updatedAt: sql`now()` })
        .where(eq(contacts.id, input.contactId));
    }

    await touchSystemState("lastSmsSentAt");
    await logActivity({
      actor: input.sender,
      action: "SMS_SENT",
      summary: `SMS sent to ${input.to}`,
      contactId: input.contactId,
      conversationId,
      entityType: "message",
      entityId: record.id,
      detail: { providerMessageId: result.providerMessageId },
    });

    return { message: updated, ok: true };
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    const [failed] = await db
      .update(messages)
      .set({ status: "FAILED", error: errorText, failedAt: new Date() })
      .where(eq(messages.id, record.id))
      .returning();

    await logActivity({
      actor: input.sender,
      action: "SMS_FAILED",
      summary: `SMS to ${input.to} failed: ${errorText.slice(0, 200)}`,
      contactId: input.contactId,
      conversationId,
      entityType: "message",
      entityId: record.id,
    });

    return { message: failed, ok: false, error: errorText };
  }
}

/** Notify the system owner (escalations, reminders). Not part of any contact conversation. */
export async function notifyOwner(text: string): Promise<boolean> {
  const owner = process.env.OWNER_PHONE_NUMBER;
  if (!owner || !isE164(owner)) {
    await logActivity({
      actor: "SYSTEM",
      action: "OWNER_NOTIFICATION_SKIPPED",
      summary: "OWNER_PHONE_NUMBER not configured; owner notification skipped",
    });
    return false;
  }
  const result = await sendMessage({
    to: owner,
    text,
    sender: "SYSTEM",
    system: true,
  });
  return result.ok;
}
