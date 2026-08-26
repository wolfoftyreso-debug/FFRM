import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, mediaAssets, messages } from "@/lib/db/schema";
import { fetchProviderImage, sanitizeImage } from "@/lib/media/image";
import { buildContactContext } from "@/lib/ai/context";
import { understandImage } from "@/lib/ai/image-understanding";
import { processInboundMessage } from "@/lib/inbound";
import { logActivity } from "@/lib/activity";

/**
 * Retrieve, validate/sanitize, store and understand every asset on one MMS,
 * then hand the already-persisted Message to the normal triage/policy loop.
 * Each asset is claimed by PENDING→PROCESSING, making retries safe.
 */
export async function processInboundMms(messageId: string): Promise<void> {
  const db = await getDb();
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId));
  if (!message || message.channel !== "MMS") return;

  const assets = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.messageId, messageId));
  const [contact] = message.contactId
    ? await db.select().from(contacts).where(eq(contacts.id, message.contactId))
    : [];

  for (const asset of assets) {
    const claimed = await db
      .update(mediaAssets)
      .set({ analysisStatus: "PROCESSING" })
      .where(
        and(
          eq(mediaAssets.id, asset.id),
          eq(mediaAssets.analysisStatus, "PENDING"),
        ),
      )
      .returning();
    if (claimed.length === 0) continue;

    try {
      if (!asset.providerUrl) throw new Error("Media has no provider URL");
      const raw = await fetchProviderImage(asset.providerUrl);
      const clean = await sanitizeImage(raw);

      await db
        .update(mediaAssets)
        .set({
          dataBase64: clean.data.toString("base64"),
          mimeType: clean.mimeType,
          byteSize: clean.data.byteLength,
          width: clean.width,
          height: clean.height,
          analysisStatus: contact ? "ANALYZING" : "STORED",
        })
        .where(eq(mediaAssets.id, asset.id));

      if (contact) {
        const context = await buildContactContext(contact, {
          conversationId: message.conversationId,
        });
        const understood = await understandImage({
          imageBase64: clean.data.toString("base64"),
          mimeType: clean.mimeType,
          messageText: message.text,
          context,
        });
        await db
          .update(mediaAssets)
          .set({
            analysisStatus: "COMPLETED",
            analysisModel: understood.usage.model,
            analysisConfidence: understood.confidence,
            analysis: understood.analysis,
            analyzedAt: new Date(),
          })
          .where(eq(mediaAssets.id, asset.id));
        await logActivity({
          actor: "AI",
          action: "IMAGE_UNDERSTOOD",
          summary: `AI analyzed an MMS image: ${understood.analysis.caption ?? "image"}`,
          contactId: contact.id,
          conversationId: message.conversationId,
          entityType: "mediaAsset",
          entityId: asset.id,
          detail: {
            model: understood.usage.model,
            confidence: understood.confidence,
          },
        });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await db
        .update(mediaAssets)
        .set({
          analysisStatus: "FAILED",
          analysisError: error,
          analyzedAt: new Date(),
        })
        .where(eq(mediaAssets.id, asset.id));
      await logActivity({
        actor: "SYSTEM",
        action: "MEDIA_PROCESSING_FAILED",
        summary: `MMS image processing failed: ${error.slice(0, 180)}`,
        contactId: message.contactId,
        conversationId: message.conversationId,
        entityType: "mediaAsset",
        entityId: asset.id,
      });
    }
  }

  // The ordinary inbound loop now sees media observations in the message and
  // applies the same confidence envelope / AUTO_REPLY vs ESCALATE policy.
  await processInboundMessage(messageId);
}
