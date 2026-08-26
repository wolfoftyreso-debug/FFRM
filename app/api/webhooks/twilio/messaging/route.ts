import { NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  contacts,
  conversations,
  mediaAssets,
  messages,
} from "@/lib/db/schema";
import { getTwilioCredentials } from "@/lib/providers/config";
import { validateTwilioSignature } from "@/lib/providers/twilio-webhook";
import { normalizePhoneNumber } from "@/lib/phone";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { processInboundSmsEvent } from "@/lib/automations/events";
import { processInboundMms } from "@/lib/mms/process-inbound";
import { logActivity } from "@/lib/activity";
import { touchSystemState } from "@/lib/system-state";

const schema = z.object({
  MessageSid: z.string().min(1),
  AccountSid: z.string().min(1),
  From: z.string().min(1),
  To: z.string().min(1),
  Body: z.string().default(""),
  NumMedia: z.coerce.number().int().min(0).max(10).default(0),
});

export async function POST(request: NextRequest) {
  let credentials;
  try {
    credentials = await getTwilioCredentials();
  } catch {
    return new Response("Twilio is not configured", { status: 503 });
  }
  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  if (
    !validateTwilioSignature({
      authToken: credentials.authToken,
      url: request.url,
      params,
      signature: request.headers.get("x-twilio-signature"),
    })
  ) {
    return new Response("unauthorized", { status: 401 });
  }

  const parsed = schema.safeParse(Object.fromEntries(params.entries()));
  if (!parsed.success || parsed.data.AccountSid !== credentials.accountSid) {
    return new Response("bad request", { status: 400 });
  }
  const input = parsed.data;
  const from = normalizePhoneNumber(input.From) ?? input.From;
  const to = normalizePhoneNumber(input.To) ?? input.To;
  const db = await getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, from))
    .limit(1);
  const conversationId = await getOrCreateConversation(contact?.id ?? null, from);
  const mediaUrls = Array.from({ length: input.NumMedia }, (_, index) =>
    params.get(`MediaUrl${index}`),
  ).filter((url): url is string => !!url);

  let messageId = "";
  let created = false;
  await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(messages)
      .values({
        conversationId,
        contactId: contact?.id ?? null,
        direction: "INBOUND",
        channel: mediaUrls.length ? "MMS" : "SMS",
        contentType: mediaUrls.length
          ? input.Body.trim()
            ? "TEXT_AND_IMAGE"
            : "IMAGE"
          : "TEXT",
        provider: "twilio",
        providerMessageId: input.MessageSid,
        fromNumber: from,
        toNumber: to,
        text: input.Body,
        status: "RECEIVED",
      })
      .onConflictDoNothing()
      .returning({ id: messages.id });
    created = inserted.length > 0;
    if (inserted[0]) {
      messageId = inserted[0].id;
    } else {
      const [existing] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.provider, "twilio"),
            eq(messages.direction, "INBOUND"),
            eq(messages.providerMessageId, input.MessageSid),
          ),
        );
      if (!existing) throw new Error("Twilio message deduplication failed");
      messageId = existing.id;
    }
    if (mediaUrls.length) {
      await tx
        .insert(mediaAssets)
        .values(
          mediaUrls.map((url, index) => ({
            conversationId,
            messageId,
            type: "IMAGE",
            mimeType:
              params.get(`MediaContentType${index}`) ??
              "application/octet-stream",
            providerMediaId: `${input.MessageSid}:${index}`,
            providerUrl: url,
            analysisStatus: "PENDING",
          })),
        )
        .onConflictDoNothing();
    }
    if (created) {
      const now = new Date();
      await tx
        .update(conversations)
        .set({ lastMessageAt: now, lastContactMessageAt: now })
        .where(eq(conversations.id, conversationId));
      if (contact) {
        await tx
          .update(contacts)
          .set({ lastInteractionAt: now, updatedAt: sql`now()` })
          .where(eq(contacts.id, contact.id));
      }
    }
  });

  await touchSystemState("lastWebhookAt");
  if (created) {
    await logActivity({
      actor: "TWILIO",
      action: mediaUrls.length ? "MMS_RECEIVED" : "SMS_RECEIVED",
      summary: `${mediaUrls.length ? "MMS" : "SMS"} received from ${
        contact?.firstName ?? from
      } via Twilio`,
      contactId: contact?.id ?? null,
      conversationId,
      entityType: "message",
      entityId: messageId,
    });
    waitUntil(
      mediaUrls.length
        ? processInboundMms(messageId)
        : processInboundSmsEvent(messageId),
    );
  }
  return new Response("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>", {
    status: 200,
    headers: { "content-type": "text/xml; charset=utf-8" },
  });
}
