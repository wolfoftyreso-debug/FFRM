import { getDb } from "@/lib/db";
import {
  contacts,
  conversations,
  mediaAssets,
  messages,
} from "@/lib/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { buildContactContext, contactDisplayName } from "@/lib/ai/context";
import { triageInboundMessage } from "@/lib/ai/triage";
import { extractMemory } from "@/lib/ai/extract";
import { canAutoReply } from "@/lib/ai/policy";
import { sendMessage, notifyOwner } from "@/lib/sms/send-message";
import { logActivity } from "@/lib/activity";
import { escalationPreviewEnabled, optionalEnv } from "@/lib/env";

/**
 * Process one persisted inbound message: triage → auto-reply or escalate.
 *
 * Idempotent: an expiring DB lease claims work; processedAt is written only
 * after the whole flow succeeds. Crashes/transient failures are reclaimable.
 */
export async function processInboundMessage(messageId: string): Promise<void> {
  const db = await getDb();

  const now = new Date();
  const staleLease = new Date(now.getTime() - 5 * 60 * 1000);
  // Claim the message — exactly one processor wins; stale leases are retried.
  const claimed = await db
    .update(messages)
    .set({
      processingStartedAt: now,
      processingAttemptCount: sql`${messages.processingAttemptCount} + 1`,
    })
    .where(
      and(
        eq(messages.id, messageId),
        isNull(messages.processedAt),
        lt(messages.processingAttemptCount, 3),
        or(
          isNull(messages.processingStartedAt),
          lt(messages.processingStartedAt, staleLease),
        ),
      ),
    )
    .returning();
  if (claimed.length === 0) return;
  const message = claimed[0];
  const complete = async () => {
    await db
      .update(messages)
      .set({ processedAt: new Date(), processingStartedAt: null })
      .where(eq(messages.id, message.id));
  };

  try {
    if (!message.contactId) {
      await escalateConversation({
        conversationId: message.conversationId,
        contactId: null,
        contactName: `Okänt nummer ${message.fromNumber}`,
        reason: "Message from unknown sender",
        messageText: message.text,
      });
      await complete();
      return;
    }

    const [contact] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, message.contactId));
    if (!contact) {
      await complete();
      return;
    }

    const conversation = message.conversationId
      ? (
          await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, message.conversationId))
        )[0]
      : undefined;

    const controlState = conversation?.aiControlState ?? "AI";

    // In USER/PAUSED/ESCALATED states the AI stays silent. ESCALATED
    // conversations are already waiting for the user in the inbox.
    if (controlState !== "AI") {
      await logActivity({
        actor: "SYSTEM",
        action: "INBOUND_HELD",
        summary: `Inbound SMS from ${contactDisplayName(contact)} held (conversation is ${controlState})`,
        contactId: contact.id,
        conversationId: message.conversationId,
        entityType: "message",
        entityId: message.id,
      });
      await runExtraction(contact, message.id, message.conversationId);
      await complete();
      return;
    }

    const ctx = await buildContactContext(contact, {
      conversationId: message.conversationId,
    });

    let incomingForTriage = message.text;
    if (
      message.contentType === "IMAGE" ||
      message.contentType === "TEXT_AND_IMAGE"
    ) {
      const assets = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.messageId, message.id));
      const understood = assets.filter(
        (a) => a.analysisStatus === "COMPLETED" && a.analysis,
      );
      if (assets.length === 0 || understood.length !== assets.length) {
        // Never answer a photo we failed to understand.
        await escalateConversation({
          conversationId: message.conversationId,
          contactId: contact.id,
          contactName: contactDisplayName(contact),
          reason: "MMS image could not be safely understood",
          messageText: message.text,
        });
        await complete();
        return;
      }
      const mediaContext = understood
        .map((asset, i) => {
          const a = asset.analysis!;
          return [
            `Image ${i + 1} direct observation: ${a.caption ?? "image"}`,
            a.visibleText?.length
              ? `Visible text: ${a.visibleText.join(", ")}`
              : null,
            a.contextualInterpretation
              ? `Cautious contextual interpretation: ${a.contextualInterpretation}`
              : null,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n\n");
      incomingForTriage = `${message.text || "(image without text)"}\n\n${mediaContext}`;
    }

    let outcome;
    try {
      outcome = await triageInboundMessage(ctx, incomingForTriage);
    } catch (err) {
      // AI failure: never lose communication — escalate to the user.
      await logActivity({
        actor: "AI",
        action: "TRIAGE_FAILED",
        summary: `AI triage failed for message from ${contactDisplayName(contact)}: ${err instanceof Error ? err.message : String(err)}`,
        contactId: contact.id,
        conversationId: message.conversationId,
        entityType: "message",
        entityId: message.id,
      });
      await escalateConversation({
        conversationId: message.conversationId,
        contactId: contact.id,
        contactName: contactDisplayName(contact),
        reason: "AI triage failed",
        messageText: message.text,
      });
      await complete();
      return;
    }

    await logActivity({
      actor: "AI",
      action: "AI_TRIAGE",
      summary: `AI classified message from ${contactDisplayName(contact)}: ${outcome.decision.decision} (${outcome.decision.policyMatch}, risk ${outcome.decision.risk}, confidence ${outcome.decision.confidence.toFixed(2)})`,
      contactId: contact.id,
      conversationId: message.conversationId,
      entityType: "message",
      entityId: message.id,
      detail: { decision: outcome.decision, model: outcome.model },
    });
    if (message.conversationId) {
      await db.insert(messages).values({
        conversationId: message.conversationId,
        contactId: contact.id,
        direction: "SYSTEM",
        channel: "SYSTEM",
        contentType: "SYSTEM",
        provider: "internal",
        fromNumber: "system",
        toNumber: "system",
        text: `AI: ${outcome.decision.decision} · ${outcome.decision.policyMatch} · ${outcome.decision.reason}`,
        status: "COMPLETED",
        sender: "AI",
      });
    }

    const verdict = canAutoReply({
      decision: outcome.decision,
      contactAutonomyLevel: contact.autonomyLevel,
      conversationState: controlState,
      envelope: contact.confidenceEnvelope,
    });

    if (verdict.allowed && outcome.decision.reply) {
      const sent = await sendMessage({
        to: message.fromNumber,
        text: outcome.decision.reply,
        sender: "AI",
        contactId: contact.id,
        conversationId: message.conversationId,
      });
      if (!sent.ok) {
        await escalateConversation({
          conversationId: message.conversationId,
          contactId: contact.id,
          contactName: contactDisplayName(contact),
          reason: "Automatic reply failed to send; user intervention required",
          messageText: message.text,
        });
      }
      if (message.conversationId) {
        await db
          .update(conversations)
          .set({ lastMessageAt: new Date() })
          .where(eq(conversations.id, message.conversationId));
      }
    } else if (outcome.decision.decision === "IGNORE" && !outcome.decision.requiresUser) {
      await logActivity({
        actor: "AI",
        action: "INBOUND_IGNORED",
        summary: `No reply needed for message from ${contactDisplayName(contact)}: ${outcome.decision.reason}`,
        contactId: contact.id,
        conversationId: message.conversationId,
        entityType: "message",
        entityId: message.id,
      });
    } else {
      await escalateConversation({
        conversationId: message.conversationId,
        contactId: contact.id,
        contactName: contactDisplayName(contact),
        reason: outcome.decision.reason || verdict.reason,
        messageText: message.text,
      });
    }

    await runExtraction(contact, message.id, message.conversationId);
    await complete();
  } catch (err) {
    // Release transient claims so cron can retry. On the final attempt,
    // escalate instead of silently losing the communication.
    if (message.processingAttemptCount >= 3) {
      try {
        const [contact] = message.contactId
          ? await db
              .select()
              .from(contacts)
              .where(eq(contacts.id, message.contactId))
          : [];
        await escalateConversation({
          conversationId: message.conversationId,
          contactId: message.contactId,
          contactName: contact ? contactDisplayName(contact) : message.fromNumber,
          reason: "Inbound processing failed repeatedly",
          messageText: message.text,
        });
        await complete();
      } catch {
        // The activity record below is the final fallback.
      }
    } else {
      await db
        .update(messages)
        .set({ processingStartedAt: null })
        .where(eq(messages.id, message.id));
    }
    await logActivity({
      actor: "SYSTEM",
      action: "INBOUND_PROCESSING_FAILED",
      summary: `Inbound processing failed: ${err instanceof Error ? err.message : String(err)}`,
      contactId: message.contactId,
      conversationId: message.conversationId,
      entityType: "message",
      entityId: message.id,
    });
  }
}

async function runExtraction(
  contact: typeof contacts.$inferSelect,
  messageId: string,
  conversationId: string | null,
): Promise<void> {
  try {
    const db = await getDb();
    const recent = await db
      .select()
      .from(messages)
      .where(
        conversationId
          ? eq(messages.conversationId, conversationId)
          : eq(messages.contactId, contact.id),
      )
      .orderBy(sql`${messages.createdAt} desc`)
      .limit(8);
    const rendered = recent
      .reverse()
      .map(
        (m) => `${m.direction === "INBOUND" ? "Contact" : "User"}: ${m.text}`,
      )
      .join("\n");
    await extractMemory({ contact, messageId, recentConversation: rendered });
  } catch {
    // Extraction is best-effort; failures must not affect the reply flow.
  }
}

export async function escalateConversation(args: {
  conversationId: string | null;
  contactId: string | null;
  contactName: string;
  reason: string;
  messageText?: string;
}): Promise<void> {
  const db = await getDb();

  let alreadyNotified = false;
  if (args.conversationId) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, args.conversationId));
    alreadyNotified =
      !!conv?.escalationNotifiedAt && conv.aiControlState === "ESCALATED";
    await db
      .update(conversations)
      .set({
        aiControlState: "ESCALATED",
        escalationReason: args.reason,
        ...(alreadyNotified ? {} : { escalationNotifiedAt: new Date() }),
      })
      .where(eq(conversations.id, args.conversationId));
  }

  await logActivity({
    actor: "AI",
    action: "ESCALATED",
    summary: `Escalated conversation with ${args.contactName}: ${args.reason}`,
    contactId: args.contactId,
    conversationId: args.conversationId,
  });

  // Owner notification — deduplicated per escalation episode.
  if (!alreadyNotified) {
    const appUrl = optionalEnv("APP_URL") ?? "";
    const link = args.conversationId
      ? `${appUrl}/messages/${args.conversationId}`
      : `${appUrl}/messages`;
    const preview =
      escalationPreviewEnabled() && args.messageText
        ? `\n"${args.messageText.slice(0, 120)}"`
        : "";
    await notifyOwner(
      `${args.contactName} behöver dig i relationssystemet.${preview}\n\nÖppna: ${link}`,
    );
  }
}
