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
import { and, eq, sql } from "drizzle-orm";
import { buildContactContext, contactDisplayName } from "@/lib/ai/context";
import { generateOutboundMessage, evaluateRelationship } from "@/lib/ai/generate";
import { canSendAutomatically, shouldDraft } from "@/lib/ai/policy";
import { sendMessage, notifyOwner } from "@/lib/sms/send-message";
import { logActivity } from "@/lib/activity";

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
}): Promise<ExecuteResult> {
  const db = await getDb();
  const { automation } = args;

  const inserted = await db
    .insert(automationExecutions)
    .values({
      automationId: automation.id,
      contactId: automation.contactId,
      occurrenceKey: args.occurrenceKey,
      scheduledFor: args.scheduledFor,
      status: "RUNNING",
      startedAt: new Date(),
      triggerPayload: args.triggerPayload ?? null,
    })
    .onConflictDoNothing()
    .returning({ id: automationExecutions.id });

  if (inserted.length === 0) {
    return { executed: false, status: "DUPLICATE" };
  }
  const executionId = inserted[0].id;

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
    });

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

    return {
      executed: true,
      status: outcome.status,
      executionId,
      detail: outcome.summary,
    };
  } catch (err) {
    const errorText = err instanceof Error ? err.message : String(err);
    await db
      .update(automationExecutions)
      .set({
        status: "FAILED",
        completedAt: new Date(),
        error: errorText,
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
    return { executed: true, status: "FAILED", executionId, detail: errorText };
  }
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
}): Promise<ActionOutcome> {
  const db = await getDb();
  const { automation, contact, executionId } = args;
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
  }
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

/** Has this occurrence already been executed? (used by tests/UI) */
export async function hasExecution(
  automationId: string,
  occurrenceKey: string,
): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: automationExecutions.id })
    .from(automationExecutions)
    .where(
      and(
        eq(automationExecutions.automationId, automationId),
        eq(automationExecutions.occurrenceKey, occurrenceKey),
      ),
    )
    .limit(1);
  return rows.length > 0;
}
