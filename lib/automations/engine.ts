import { getDb } from "@/lib/db";
import {
  automationExecutions,
  automations,
  contacts,
  reminders,
  type ActionConfig,
  type Automation,
  type Contact,
} from "@/lib/db/schema";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { buildContactContext, contactDisplayName } from "@/lib/ai/context";
import { generateOutboundMessage, evaluateRelationship } from "@/lib/ai/generate";
import { canSendAutomatically, shouldDraft } from "@/lib/ai/policy";
import {
  getOrCreateConversation,
  sendMessage,
  notifyOwner,
} from "@/lib/sms/send-message";
import { logActivity } from "@/lib/activity";
import { appendConversationEvent } from "@/lib/conversation-events";
import { extractConversationInsights } from "@/lib/ai/extract-insights";

export interface ExecuteResult {
  executed: boolean;
  status: string;
  executionId?: string;
  detail?: string;
}
/**
 * Execute one occurrence of an automation.
 *
 * Idempotency: the execution row is inserted first with a unique
 * (automationId, occurrenceKey) constraint. If the row already exists the
 * occurrence has been handled (or is being handled) and we do nothing —
 * a repeated invocation can never send the same SMS twice.
 */
export async function executeAutomation(args: {
  automation: Automation;
  occurrenceKey: string;
  scheduledFor: Date;
  triggerPayload?: unknown;
  now?: Date;
}): Promise<ExecuteResult> {
  const db = await getDb();
  const { automation } = args;
  const now = args.now ?? new Date();

  let claimed = await db
    .insert(automationExecutions)
    .values({
      automationId: automation.id,
      contactId: automation.contactId,
      occurrenceKey: args.occurrenceKey,
      scheduledFor: args.scheduledFor,
      status: "RUNNING",
      startedAt: now,
      triggerPayload: args.triggerPayload ?? null,
    })
    .onConflictDoNothing()
    .returning({
      id: automationExecutions.id,
      retryCount: automationExecutions.retryCount,
    });

  if (claimed.length === 0) {
    // Explicit failures are safe to retry with the same occurrence key.
    // RUNNING/COMPLETED rows are never reclaimed here (ambiguous side effect).
    claimed = await db
      .update(automationExecutions)
      .set({
        status: "RUNNING",
        startedAt: now,
        completedAt: null,
        nextRetryAt: null,
      })
      .where(
        and(
          eq(automationExecutions.automationId, automation.id),
          eq(automationExecutions.occurrenceKey, args.occurrenceKey),
          eq(automationExecutions.status, "FAILED"),
          lte(automationExecutions.retryCount, 2),
          or(
            isNull(automationExecutions.nextRetryAt),
            lte(automationExecutions.nextRetryAt, now),
          ),
        ),
      )
      .returning({
        id: automationExecutions.id,
        retryCount: automationExecutions.retryCount,
      });
    if (claimed.length === 0) {
      return { executed: false, status: "DUPLICATE" };
    }
  }
  const executionId = claimed[0].id;
  const priorRetryCount = claimed[0].retryCount;

  let contact: Contact | null = null;
  if (automation.contactId) {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, automation.contactId));
    contact = rows[0] ?? null;
  }

  try {
    const outcome = await runAction({
      automation,
      contact,
      executionId,
      scheduledFor: args.scheduledFor,
    });

    const failed = outcome.status === "FAILED";
    const nextRetryCount = failed ? priorRetryCount + 1 : priorRetryCount;
    await db
      .update(automationExecutions)
      .set({
        status: outcome.status,
        completedAt: new Date(),
        decision: outcome.decision ?? null,
        result: outcome.result ?? null,
        contextSnapshot: outcome.contextSnapshot ?? null,
        aiModel: outcome.aiModel ?? null,
        aiInputTokens: outcome.aiInputTokens ?? null,
        aiOutputTokens: outcome.aiOutputTokens ?? null,
        error: failed ? (outcome.summary ?? "Automation action failed") : null,
        retryCount: nextRetryCount,
        nextRetryAt:
          failed && nextRetryCount < 3
            ? retryAt(nextRetryCount)
            : null,
      })
      .where(eq(automationExecutions.id, executionId));

    await db
      .update(automations)
      .set({ lastRunAt: new Date(), updatedAt: sql`now()` })
      .where(eq(automations.id, automation.id));

    await logActivity({
      actor: "AUTOMATION",
      action: `AUTOMATION_${outcome.status}`,
      summary: `Automation "${automation.name}" ${outcome.status.toLowerCase()}${outcome.summary ? `: ${outcome.summary}` : ""}`,
      contactId: automation.contactId,
      entityType: "automationExecution",
      entityId: executionId,
    });
    if (contact) {
      const conversationId = await getOrCreateConversation(
        contact.id,
        contact.phoneNumber,
      );
      await appendConversationEvent({
        conversationId,
        contactId: contact.id,
        channel: "AUTOMATION",
        eventKey: `automation:${executionId}:attempt:${priorRetryCount}`,
        text: `${automation.name} · ${outcome.status}${
          outcome.summary ? ` · ${outcome.summary}` : ""
        }`,
        sender: "AUTOMATION",
      });
    }

    return {
      executed: true,
      status: outcome.status,
      executionId,
      detail: outcome.summary,
    };
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    const nextRetryCount = priorRetryCount + 1;
    await db
      .update(automationExecutions)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        error: errorText,
        retryCount: nextRetryCount,
        nextRetryAt:
          nextRetryCount < 3 ? retryAt(nextRetryCount) : null,
      })
      .where(eq(automationExecutions.id, executionId));
    await logActivity({
      actor: "AUTOMATION",
      action: "AUTOMATION_FAILED",
      summary: `Automation "${automation.name}" failed: ${errorText.slice(0, 200)}`,
      contactId: automation.contactId,
      entityType: "automationExecution",
      entityId: executionId,
    });
    if (contact) {
      const conversationId = await getOrCreateConversation(
        contact.id,
        contact.phoneNumber,
      );
      await appendConversationEvent({
        conversationId,
        contactId: contact.id,
        channel: "AUTOMATION",
        eventKey: `automation:${executionId}:attempt:${priorRetryCount}`,
        text: `${automation.name} · FAILED · ${errorText.slice(0, 160)}`,
        sender: "AUTOMATION",
      });
    }
    return { executed: true, status: "FAILED", executionId, detail: errorText };
  }
}

function retryAt(retryCount: number): Date {
  // 1m, 2m, then exhausted. Kept short for personal communications while
  // preventing a tight loop during provider outages.
  return new Date(Date.now() + 2 ** Math.max(0, retryCount - 1) * 60_000);
}

interface ActionOutcome {
  status: "COMPLETED" | "FAILED" | "SKIPPED" | "ESCALATED";
  summary?: string;
  decision?: unknown;
  result?: unknown;
  contextSnapshot?: unknown;
  aiModel?: string;
  aiInputTokens?: number | null;
  aiOutputTokens?: number | null;
}

async function runAction(args: {
  automation: Automation;
  contact: Contact | null;
  executionId: string;
  scheduledFor: Date;
}): Promise<ActionOutcome> {
  const db = await getDb();
  const { automation, contact, executionId, scheduledFor } = args;
  const config: ActionConfig = automation.actionConfig ?? {};

  switch (automation.actionType) {
    case "SEND_SMS": {
      if (!contact?.phoneNumber)
        return { status: "FAILED", summary: "Contact has no phone number" };
      if (!config.text?.trim())
        return { status: "FAILED", summary: "No message text configured" };
      if (!canSendAutomatically(effectiveAutonomy(automation, contact))) {
        return await queueDraft({
          contact,
          automation,
          executionId,
          text: config.text,
          summary: "Autonomy level requires approval",
        });
      }
      const sent = await sendMessage({
        to: contact.phoneNumber,
        text: config.text,
        sender: "AUTOMATION",
        contactId: contact.id,
        automationExecutionId: executionId,
      });
      return sent.ok
        ? {
            status: "COMPLETED",
            summary: `SMS sent to ${contactDisplayName(contact)}`,
            result: { messageId: sent.message.id },
          }
        : { status: "FAILED", summary: sent.error };
    }

    case "GENERATE_SMS": {
      if (!contact?.phoneNumber)
        return { status: "FAILED", summary: "Contact has no phone number" };
      const ctx = await buildContactContext(contact);
      const generated = await generateOutboundMessage({
        ctx,
        purpose: config.purpose ?? "checkin",
        instruction: config.instruction,
      });
      const autonomy = effectiveAutonomy(automation, contact);
      const base = {
        contextSnapshot: {
          facts: ctx.confirmedFacts,
          daysSinceLastInteraction: ctx.daysSinceLastInteraction,
        },
        aiModel: generated.usage.model,
        aiInputTokens: generated.usage.inputTokens,
        aiOutputTokens: generated.usage.outputTokens,
      };
      if (canSendAutomatically(autonomy)) {
        const sent = await sendMessage({
          to: contact.phoneNumber,
          text: generated.text,
          sender: "AI",
          contactId: contact.id,
          automationExecutionId: executionId,
        });
        return sent.ok
          ? {
              ...base,
              status: "COMPLETED",
              summary: `AI message sent to ${contactDisplayName(contact)}`,
              result: { messageId: sent.message.id, text: generated.text },
            }
          : { ...base, status: "FAILED", summary: sent.error };
      }
      if (shouldDraft(autonomy)) {
        return {
          ...base,
          ...(await queueDraft({
            contact,
            automation,
            executionId,
            text: generated.text,
            summary: "Draft created for approval",
          })),
        };
      }
      // REMIND / MEMORY_ONLY: no sending at all, remind instead.
      await db.insert(reminders).values({
        contactId: contact.id,
        kind: "REMINDER",
        title: `${automation.name}: contact ${contactDisplayName(contact)}`,
        description: config.instruction ?? null,
        dueAt: new Date(),
        automationId: automation.id,
        automationExecutionId: executionId,
      });
      return {
        ...base,
        status: "COMPLETED",
        summary: "Reminder created (autonomy level does not permit drafting/sending)",
      };
    }

    case "REMIND_USER": {
      const title =
        config.title ??
        (contact
          ? `Reminder about ${contactDisplayName(contact)}`
          : `Reminder: ${automation.name}`);
      await db.insert(reminders).values({
        contactId: contact?.id ?? null,
        kind: "REMINDER",
        title,
        description: config.description ?? null,
        dueAt: new Date(),
        automationId: automation.id,
        automationExecutionId: executionId,
      });
      if (config.notifyBySms !== false) {
        await notifyOwner(`Påminnelse: ${title}`);
      }
      return { status: "COMPLETED", summary: title };
    }

    case "CREATE_TASK": {
      await db.insert(reminders).values({
        contactId: contact?.id ?? null,
        kind: "TASK",
        title: config.title ?? automation.name,
        description: config.description ?? null,
        dueAt: new Date(),
        automationId: automation.id,
        automationExecutionId: executionId,
      });
      return { status: "COMPLETED", summary: `Task created: ${config.title ?? automation.name}` };
    }

    case "CREATE_CALENDAR_EVENT": {
      await db.insert(reminders).values({
        contactId: contact?.id ?? null,
        kind: "EVENT",
        title: config.title ?? automation.name,
        description: config.description ?? null,
        dueAt: new Date(),
        automationId: automation.id,
        automationExecutionId: executionId,
      });
      return { status: "COMPLETED", summary: `Event created: ${config.title ?? automation.name}` };
    }

    case "AI_EVALUATE": {
      if (!contact) return { status: "FAILED", summary: "No contact configured" };
      const ctx = await buildContactContext(contact);
      const { evaluation, usage } = await evaluateRelationship(ctx);
      if (evaluation.shouldReachOut) {
        await db.insert(reminders).values({
          contactId: contact.id,
          kind: "REMINDER",
          title: `Reach out to ${contactDisplayName(contact)}`,
          description: `${evaluation.reason}${evaluation.suggestion ? ` — Suggestion: ${evaluation.suggestion}` : ""}`,
          dueAt: new Date(),
          automationId: automation.id,
          automationExecutionId: executionId,
        });
      }
      return {
        status: "COMPLETED",
        summary: evaluation.shouldReachOut
          ? `Outreach recommended: ${evaluation.reason}`
          : `No outreach needed: ${evaluation.reason}`,
        decision: evaluation,
        aiModel: usage.model,
        aiInputTokens: usage.inputTokens,
        aiOutputTokens: usage.outputTokens,
      };
    }

    case "ESCALATE": {
      const title = config.title ?? `Automation "${automation.name}" needs you`;
      await db.insert(reminders).values({
        contactId: contact?.id ?? null,
        kind: "REMINDER",
        title,
        description: config.description ?? null,
        dueAt: new Date(),
        automationId: automation.id,
        automationExecutionId: executionId,
      });
      await notifyOwner(title);
      return { status: "ESCALATED", summary: title };
    }

    case "UPDATE_CONTACT": {
      if (!contact) return { status: "FAILED", summary: "No contact configured" };
      const allowed = ["notes", "importance", "relationshipType"] as const;
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (config.fields && key in config.fields)
          updates[key] = config.fields[key];
      }
      if (Object.keys(updates).length === 0)
        return { status: "SKIPPED", summary: "No updatable fields configured" };
      await db
        .update(contacts)
        .set({ ...updates, updatedAt: sql`now()` })
        .where(eq(contacts.id, contact.id));
      return {
        status: "COMPLETED",
        summary: `Contact updated: ${Object.keys(updates).join(", ")}`,
        result: updates,
      };
    }

    case "LOG_EVENT": {
      return {
        status: "COMPLETED",
        summary: config.description ?? config.title ?? automation.name,
        result: { logged: true },
      };
    }

    case "EXTRACT_INSIGHTS": {
      const lookbackHours = Math.max(
        1,
        Math.min(config.lookbackHours ?? 12, 48),
      );
      const extracted = await extractConversationInsights({
        windowStart: new Date(
          scheduledFor.getTime() - lookbackHours * 60 * 60 * 1000,
        ),
        windowEnd: scheduledFor,
        executionId,
        contactLimit: config.contactLimit,
      });
      return {
        status: "COMPLETED",
        summary: `${extracted.created} findings created from ${extracted.sourcesScanned} sources`,
        result: {
          groupsScanned: extracted.groupsScanned,
          sourcesScanned: extracted.sourcesScanned,
          created: extracted.created,
          rejected: extracted.rejected,
        },
        aiModel: extracted.usage[0]?.model,
        aiInputTokens: sumUsage(extracted.usage, "inputTokens"),
        aiOutputTokens: sumUsage(extracted.usage, "outputTokens"),
      };
    }
  }
}

function sumUsage(
  usage: { inputTokens: number | null; outputTokens: number | null }[],
  field: "inputTokens" | "outputTokens",
): number | null {
  const values = usage
    .map((item) => item[field])
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

/** The effective autonomy is the stricter of automation and contact settings. */
export function effectiveAutonomy(
  automation: Pick<Automation, "autonomyLevel">,
  contact: Pick<Contact, "autonomyLevel"> | null,
): number {
  if (!contact) return automation.autonomyLevel;
  return Math.min(automation.autonomyLevel, contact.autonomyLevel);
}

async function queueDraft(args: {
  contact: Contact;
  automation: Automation;
  executionId: string;
  text: string;
  summary: string;
}): Promise<ActionOutcome> {
  const db = await getDb();
  await db.insert(reminders).values({
    contactId: args.contact.id,
    kind: "DRAFT",
    title: `Draft for ${contactDisplayName(args.contact)} (${args.automation.name})`,
    description: "Approve to send, dismiss to discard.",
    draftText: args.text,
    dueAt: new Date(),
    automationId: args.automation.id,
    automationExecutionId: args.executionId,
  });
  return {
    status: "ESCALATED",
    summary: args.summary,
    result: { draft: args.text },
  };
}
