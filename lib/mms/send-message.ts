import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, conversations, mediaAssets, messages } from "@/lib/db/schema";
import { isE164 } from "@/lib/phone";
import { getElksCredentials } from "@/lib/providers/config";
import { getMessagingProvider } from "@/lib/sms/provider";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { prepareMmsImage, MAX_MMS_PAYLOAD_BYTES } from "@/lib/media/image";
import { logActivity } from "@/lib/activity";
import { touchSystemState } from "@/lib/system-state";

export async function sendMediaMessage(input: {
  to: string;
  text: string;
  image: Uint8Array;
  sender: "USER" | "AI" | "AUTOMATION";
  contactId?: string | null;
  conversationId?: string | null;
}) {
  if (!isE164(input.to)) throw new Error("MMS recipient must be E.164");
  const clean = await prepareMmsImage(
    input.image,
    Buffer.byteLength(input.text, "utf8"),
  );
  const dataUrl = `data:${clean.mimeType};base64,${clean.data.toString("base64")}`;
  const estimatedPayload =
    Buffer.byteLength(dataUrl, "utf8") + Buffer.byteLength(input.text, "utf8");
  if (estimatedPayload > MAX_MMS_PAYLOAD_BYTES) {
    throw new Error("MMS payload exceeds the 320kB provider limit");
  }

  const db = await getDb();
  const conversationId =
    input.conversationId ??
    (await getOrCreateConversation(input.contactId ?? null, input.to));
  const { fromNumber: from } = await getElksCredentials();

  // Persist Message + sanitized media before the provider side effect.
  const [message] = await db
    .insert(messages)
    .values({
      conversationId,
      contactId: input.contactId ?? null,
      direction: "OUTBOUND",
      channel: "MMS",
      contentType: input.text.trim() ? "TEXT_AND_IMAGE" : "IMAGE",
      provider: "46elks",
      fromNumber: from,
      toNumber: input.to,
      text: input.text.trim(),
      status: "PENDING",
      sender: input.sender,
    })
    .returning();
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      conversationId,
      messageId: message.id,
      type: "IMAGE",
      mimeType: clean.mimeType,
      dataBase64: clean.data.toString("base64"),
      byteSize: clean.data.byteLength,
      width: clean.width,
      height: clean.height,
      analysisStatus: "NOT_REQUESTED",
    })
    .returning();
  await db
    .update(mediaAssets)
    .set({ storageUrl: `/api/media/${asset.id}` })
    .where(eq(mediaAssets.id, asset.id));
  asset.storageUrl = `/api/media/${asset.id}`;

  let acceptedProviderId: string | null = null;
  try {
    const provider = await getMessagingProvider();
    if (!provider.sendMms) throw new Error("Messaging provider does not support MMS");
    const result = await provider.sendMms({
      to: input.to,
      text: input.text,
      imageDataUrl: dataUrl,
    });
    acceptedProviderId = result.providerMessageId;
    const [updated] = await db
      .update(messages)
      .set({
        providerMessageId: result.providerMessageId,
        status: "SENT",
        sentAt: new Date(),
      })
      .where(eq(messages.id, message.id))
      .returning();
    await db
      .update(conversations)
      .set({ lastMessageAt: new Date(), lastUserMessageAt: new Date() })
      .where(eq(conversations.id, conversationId));
    if (input.contactId) {
      await db
        .update(contacts)
        .set({ lastInteractionAt: new Date(), updatedAt: sql`now()` })
        .where(eq(contacts.id, input.contactId));
    }
    await touchSystemState("lastSmsSentAt");
    await logActivity({
      actor: input.sender,
      action: "MMS_SENT",
      summary: `MMS sent to ${input.to}`,
      contactId: input.contactId,
      conversationId,
      entityType: "message",
      entityId: message.id,
      detail: { providerMessageId: result.providerMessageId, mediaAssetId: asset.id },
    });
    return { ok: true as const, message: updated, asset };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const ambiguous = acceptedProviderId !== null;
    const [failed] = await db
      .update(messages)
      .set({
        status: ambiguous ? "SENT_UNKNOWN" : "FAILED",
        providerMessageId: acceptedProviderId,
        error,
        failedAt: ambiguous ? null : new Date(),
      })
      .where(eq(messages.id, message.id))
      .returning();
    await logActivity({
      actor: input.sender,
      action: ambiguous ? "MMS_STATUS_UNKNOWN" : "MMS_FAILED",
      summary: ambiguous
        ? `46elks accepted MMS ${acceptedProviderId}, but local confirmation failed; automatic resend blocked`
        : `MMS to ${input.to} failed: ${error.slice(0, 160)}`,
      contactId: input.contactId,
      conversationId,
      entityType: "message",
      entityId: message.id,
    });
    return { ok: false as const, message: failed, asset, error };
  }
}
