import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";

/**
 * Persist a call/voicemail/AI event in the same Message thread as SMS/MMS.
 * providerMessageId is an idempotency key so retried voice callbacks cannot
 * duplicate timeline events.
 */
export async function appendConversationEvent(input: {
  conversationId: string | null;
  contactId: string | null;
  channel: "VOICE_CALL" | "VOICEMAIL" | "SYSTEM";
  eventKey: string;
  text: string;
  sender?: "SYSTEM" | "AI";
}): Promise<void> {
  if (!input.conversationId) return;
  const db = await getDb();
  await db
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
    .onConflictDoNothing();
}
