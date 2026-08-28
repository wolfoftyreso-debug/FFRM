import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { contacts, conversations, messages } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { normalizePhoneNumber } from "@/lib/phone";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { processInboundSmsEvent } from "@/lib/automations/events";
import { logActivity } from "@/lib/activity";
import { touchSystemState } from "@/lib/system-state";
import { optionalEnv } from "@/lib/env";

const inboundSchema = z.object({
  id: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  message: z.string(),
  direction: z.string().optional(),
  created: z.string().optional(),
});

/**
 * Inbound SMS webhook from 46elks (form-urlencoded POST).
 *
 * Contract:
 * - The message is PERSISTED before any AI work happens.
 * - The provider message id is a unique idempotency key, so 46elks retries
 *   (sent whenever we fail to return 2xx) can never create duplicates or
 *   trigger multiple AI replies.
 * - The response is a fast, empty 200 — a non-empty body would be sent back
 *   to the contact as an SMS reply by 46elks.
 */
export async function POST(req: NextRequest) {
  const expectedToken = optionalEnv("WEBHOOK_TOKEN");
  if (expectedToken) {
    const token = req.nextUrl.searchParams.get("token");
    if (token !== expectedToken) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  let parsed: z.infer<typeof inboundSchema>;
  try {
    const form = await req.formData();
    parsed = inboundSchema.parse(Object.fromEntries(form.entries()));
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const db = await getDb();
  const from = normalizePhoneNumber(parsed.from) ?? parsed.from;
  const to = normalizePhoneNumber(parsed.to) ?? parsed.to;

  // Resolve contact by canonical phone number.
  const contactRows = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, from))
    .limit(1);
  const contact = contactRows[0] ?? null;

  const conversationId = await getOrCreateConversation(
    contact?.id ?? null,
    from,
  );

  // Persist first; the unique (provider, direction, providerMessageId) index
  // deduplicates webhook retries.
  const inserted = await db
    .insert(messages)
    .values({
      conversationId,
      contactId: contact?.id ?? null,
      direction: "INBOUND",
      provider: "46elks",
      providerMessageId: parsed.id,
      fromNumber: from,
      toNumber: to,
      text: parsed.message,
      status: "RECEIVED",
    })
    .onConflictDoNothing()
    .returning({ id: messages.id });

  await touchSystemState("lastWebhookAt");

  if (inserted.length === 0) {
    // Duplicate delivery of an already-stored message: acknowledge quietly.
    return new NextResponse(null, { status: 200 });
  }
  const messageId = inserted[0].id;

  const nowDate = new Date();
  await db
    .update(conversations)
    .set({ lastMessageAt: nowDate, lastContactMessageAt: nowDate })
    .where(eq(conversations.id, conversationId));
  if (contact) {
    await db
      .update(contacts)
      .set({ lastInteractionAt: nowDate, updatedAt: sql`now()` })
      .where(and(eq(contacts.id, contact.id)));
  }

  await logActivity({
    actor: "46ELKS",
    action: "SMS_RECEIVED",
    summary: `SMS received from ${contact ? `${contact.firstName}` : from}`,
    contactId: contact?.id ?? null,
    conversationId,
    entityType: "message",
    entityId: messageId,
  });

  // AI triage happens after the response is returned; the cron dispatcher
  // re-processes any message whose processing did not complete.
  waitUntil(processInboundSmsEvent(messageId));

  return new NextResponse(null, { status: 200 });
}
