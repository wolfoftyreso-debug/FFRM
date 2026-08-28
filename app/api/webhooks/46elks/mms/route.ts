import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, conversations, mediaAssets, messages } from "@/lib/db/schema";
import { normalizePhoneNumber } from "@/lib/phone";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { processInboundMms } from "@/lib/mms/process-inbound";
import { logActivity } from "@/lib/activity";
import { touchSystemState } from "@/lib/system-state";
import { webhookRequestIsAuthorized } from "@/lib/webhooks/auth";

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
  if (!webhookRequestIsAuthorized(req)) {
    await touchSystemState("lastRejectedWebhookAt");
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

  let messageId = "";
  let created = false;
  // Message + media metadata + interaction timestamps commit atomically.
  // On a retry, missing media metadata from any legacy partial write is
  // repaired using providerMediaId upserts.
  await db.transaction(async (tx) => {
    const inserted = await tx
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
    created = inserted.length > 0;
    if (inserted[0]) {
      messageId = inserted[0].id;
    } else {
      const [existing] = await tx
        .select({ id: messages.id })
        .from(messages)
        .where(
          and(
            eq(messages.provider, "46elks"),
            eq(messages.direction, "INBOUND"),
            eq(messages.providerMessageId, parsed.id),
          ),
        );
      if (!existing) throw new Error("MMS deduplication record missing");
      messageId = existing.id;
    }

    if (imageUrls.length > 0) {
      await tx
        .insert(mediaAssets)
        .values(
          imageUrls.map((url, index) => ({
            conversationId,
            messageId,
            type: "IMAGE",
            mimeType: "application/octet-stream",
            providerMediaId: `${parsed.id}:${index + 1}`,
            providerUrl: url,
            dataBase64: null,
            byteSize: null,
            analysisStatus: "PENDING",
          })),
        )
        .onConflictDoNothing();
    }

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
  });

  await touchSystemState("lastWebhookAt");
  if (created) await logActivity({
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
