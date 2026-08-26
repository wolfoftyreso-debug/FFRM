import { getDb } from "@/lib/db";
import { conversations, messages } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

/**
 * Persist a call/voicemail/AI event in the same Message thread as SMS/MMS.
 * providerMessageId is an idempotency key so retried voice callbacks cannot
 * duplicate timeline events.
 */
export async function appendConversationEvent(input: {
  conversationId: string | null;
  contactId: string | null;
  channel: "VOICE_CALL" | "VOICEMAIL" | "AUTOMATION" | "SYSTEM";
  eventKey: string;
  text: string;
  sender?: "SYSTEM" | "AI" | "AUTOMATION";
}): Promise<void> {
  if (!input.conversationId) return;
  const db = await getDb();
  const inserted = await db
    .insert(messages)
    .values({
      conversationId: input.conversationId,
      contactId: input.contactId,
      direction: "SYSTEM",
      channel: input.channel,
      contentType: "SYSTEM",
      provider: "internal",
      providerMessageId: input.eventKey,
      fromNumber: "system",
      toNumber: "system",
      text: input.text,
      status: "COMPLETED",
      sender: input.sender ?? "SYSTEM",
    })
    .onConflictDoNothing()
    .returning({ createdAt: messages.createdAt });
  if (inserted[0]) {
    await db
      .update(conversations)
      .set({ lastMessageAt: inserted[0].createdAt })
      .where(eq(conversations.id, input.conversationId));
  }
}
