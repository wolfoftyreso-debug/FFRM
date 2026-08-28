import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { automations, messages } from "@/lib/db/schema";
import { executeAutomation } from "./engine";
import { processInboundMessage } from "@/lib/inbound";

/**
 * Complete the standard AI conversation flow, then fire enabled INCOMING_SMS
 * automations. Execution occurrence = provider message id, so webhook and cron
 * retries can never run an event automation twice.
 */
export async function processInboundSmsEvent(messageId: string): Promise<void> {
  await processInboundMessage(messageId);
  const db = await getDb();
  const [message] = await db
    .select()
    .from(messages)
    .where(eq(messages.id, messageId));
  if (!message || message.channel !== "SMS" || !message.processedAt) return;

  const matching = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.enabled, true),
        eq(automations.triggerType, "INCOMING_SMS"),
        message.contactId
          ? or(
              eq(automations.contactId, message.contactId),
              isNull(automations.contactId),
            )
          : isNull(automations.contactId),
      ),
    );
  for (const automation of matching) {
    await executeAutomation({
      automation,
      occurrenceKey: `incoming-sms:${message.providerMessageId ?? message.id}`,
      scheduledFor: message.createdAt,
      triggerPayload: {
        messageId: message.id,
        providerMessageId: message.providerMessageId,
        from: message.fromNumber,
        text: message.text,
      },
    });
  }
}
