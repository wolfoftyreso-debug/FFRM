import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, conversations, mediaAssets, messages } from "@/lib/db/schema";
import { normalizePhoneNumber } from "@/lib/phone";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { processInboundMms } from "@/lib/mms/process-inbound";
import { logActivity } from "@/lib/activity";
import { touchSystemState } from "@/lib/system-state";
import { optionalEnv } from "@/lib/env";

const mmsSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    message: z.string().optional().default(""),
    created: z.string().optional(),
    image: z.string().url().optional(),
    image2: z.string().url().optional(),
    image3: z.string().url().optional(),
    image4: z.string().url().optional(),
  })
  .refine((v) => v.message.trim() || v.image, {
    message: "MMS requires text or an image",
  });

/** Inbound 46elks MMS webhook (`mms_url`). Persist metadata before media/AI. */
export async function POST(req: NextRequest) {
  const expectedToken = optionalEnv("WEBHOOK_TOKEN");
  if (expectedToken && req.nextUrl.searchParams.get("token") !== expectedToken) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  let parsed: z.infer<typeof mmsSchema>;
  try {
    const form = await req.formData();
    parsed = mmsSchema.parse(Object.fromEntries(form.entries()));
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const db = await getDb();
  const from = normalizePhoneNumber(parsed.from) ?? parsed.from;
  const to = normalizePhoneNumber(parsed.to) ?? parsed.to;
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, from))
    .limit(1);
  const conversationId = await getOrCreateConversation(contact?.id ?? null, from);
  const imageUrls = [
    parsed.image,
    parsed.image2,
    parsed.image3,
    parsed.image4,
  ].filter((u): u is string => !!u);

  // Persist the Message first. The same provider-id unique constraint as SMS
  // deduplicates 46elks retries before any side effect or model call.
  const inserted = await db
    .insert(messages)
    .values({
      conversationId,
      contactId: contact?.id ?? null,
      direction: "INBOUND",
      channel: "MMS",
      contentType:
        imageUrls.length > 0
          ? parsed.message.trim()
            ? "TEXT_AND_IMAGE"
            : "IMAGE"
          : "TEXT",
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
  if (inserted.length === 0) return new NextResponse(null, { status: 200 });
  const messageId = inserted[0].id;

  // Media metadata (provider URL provenance) is persisted before retrieval.
  if (imageUrls.length > 0) {
    await db.insert(mediaAssets).values(
      imageUrls.map((url, index) => ({
        conversationId,
        messageId,
        type: "IMAGE",
        mimeType: "application/octet-stream", // replaced after byte inspection
        providerMediaId: `${parsed.id}:${index + 1}`,
        providerUrl: url,
        dataBase64: null,
        byteSize: null,
        analysisStatus: "PENDING",
      })),
    );
  }

  const now = new Date();
  await db
    .update(conversations)
    .set({ lastMessageAt: now, lastContactMessageAt: now })
    .where(eq(conversations.id, conversationId));
  if (contact) {
    await db
      .update(contacts)
      .set({ lastInteractionAt: now, updatedAt: sql`now()` })
      .where(eq(contacts.id, contact.id));
  }
  await logActivity({
    actor: "46ELKS",
    action: "MMS_RECEIVED",
    summary: `MMS received from ${contact?.firstName ?? from} (${imageUrls.length} image${imageUrls.length === 1 ? "" : "s"})`,
    contactId: contact?.id ?? null,
    conversationId,
    entityType: "message",
    entityId: messageId,
  });

  // Empty fast 200; work continues safely after persistence.
  waitUntil(processInboundMms(messageId));
  return new NextResponse(null, { status: 200 });
}
