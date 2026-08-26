import { getDb } from "@/lib/db";
import {
  automations,
  contacts,
  messages,
  type Automation,
  type Contact,
} from "@/lib/db/schema";
import { and, eq, isNull, isNotNull, lte, lt, sql } from "drizzle-orm";
import { computeNextRun, occurrenceKeyFor } from "./recurrence";
import { executeAutomation } from "./engine";
import { processInboundMessage } from "@/lib/inbound";
import { touchSystemState } from "@/lib/system-state";

export interface DispatchSummary {
  due: number;
  executed: number;
  skipped: number;
  failed: number;
  inboundProcessed: number;
}

/**
 * Central scheduler entry point, invoked by Vercel Cron every minute.
 *
 * One dispatcher for ALL automations: the database decides which jobs are
 * due (nextRunAt <= now). Idempotency is guaranteed by the unique
 * (automationId, occurrenceKey) constraint on executions, so overlapping or
 * repeated dispatcher runs never duplicate side effects.
 */
export async function runDispatcher(now: Date = new Date()): Promise<DispatchSummary> {
  const db = await getDb();
  await touchSystemState("lastCronAt");

  const summary: DispatchSummary = {
    due: 0,
    executed: 0,
    skipped: 0,
    failed: 0,
    inboundProcessed: 0,
  };

  const due = await db
    .select()
    .from(automations)
    .where(
      and(
        eq(automations.enabled, true),
        isNotNull(automations.nextRunAt),
        lte(automations.nextRunAt, now),
      ),
    )
    .limit(50);

  summary.due = due.length;

  for (const automation of due) {
    try {
      const result = await dispatchOne(automation, now);
      if (result === "executed") summary.executed++;
      else if (result === "failed") summary.failed++;
      else summary.skipped++;
    } catch {
      summary.failed++;
    }
  }

  // Fallback processing of inbound messages whose post-webhook processing
  // did not complete (e.g. function terminated). Never lose communication.
  const staleCutoff = new Date(now.getTime() - 90 * 1000);
  const unprocessed = await db
    .select({ id: messages.id })
    .from(messages)
    .where(
      and(
        eq(messages.direction, "INBOUND"),
        isNull(messages.processedAt),
        lt(messages.createdAt, staleCutoff),
      ),
    )
    .limit(20);
  for (const m of unprocessed) {
    await processInboundMessage(m.id);
    summary.inboundProcessed++;
  }

  return summary;
}

async function dispatchOne(
  automation: Automation,
  now: Date,
): Promise<"executed" | "skipped" | "failed"> {
  const db = await getDb();

  let contact: Contact | null = null;
  if (automation.contactId) {
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, automation.contactId));
    contact = rows[0] ?? null;
  }

  const scheduledFor = automation.nextRunAt ?? now;

  if (automation.triggerType === "NO_CONTACT_FOR") {
    return dispatchNoContact(automation, contact, now);
  }

  const occurrenceKey = occurrenceKeyFor({
    triggerType: automation.triggerType,
    scheduledFor,
  });

  const result = await executeAutomation({
    automation,
    occurrenceKey,
    scheduledFor,
    triggerPayload: { trigger: automation.triggerType, scheduledFor },
  });

  // Always advance nextRunAt — even after failure — so a broken automation
  // cannot wedge the dispatcher. Failures remain visible in the execution log.
  const nextRunAt = computeNextRun({
    triggerType: automation.triggerType,
    triggerConfig: automation.triggerConfig ?? {},
    contact,
    after: now,
  });
  await db
    .update(automations)
    .set({ nextRunAt, updatedAt: sql`now()` })
    .where(eq(automations.id, automation.id));

  if (!result.executed) return "skipped";
  return result.status === "FAILED" ? "failed" : "executed";
}

async function dispatchNoContact(
  automation: Automation,
  contact: Contact | null,
  now: Date,
): Promise<"executed" | "skipped" | "failed"> {
  const db = await getDb();
  const days = automation.triggerConfig?.days ?? 10;
  const threshold = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);

  let outcome: "executed" | "skipped" | "failed" = "skipped";

  const conditionMet =
    !!contact &&
    (contact.lastInteractionAt === null ||
      contact.lastInteractionAt <= threshold);

  if (conditionMet && contact) {
    // One execution per inactivity episode: the occurrence key embeds the
    // lastInteractionAt timestamp, so a new interaction re-arms the trigger.
    const occurrenceKey = occurrenceKeyFor({
      triggerType: "NO_CONTACT_FOR",
      scheduledFor: now,
      lastInteractionAt: contact.lastInteractionAt,
    });
    const result = await executeAutomation({
      automation,
      occurrenceKey,
      scheduledFor: now,
      triggerPayload: {
        trigger: "NO_CONTACT_FOR",
        days,
        lastInteractionAt: contact.lastInteractionAt,
      },
    });
    if (result.executed) {
      outcome = result.status === "FAILED" ? "failed" : "executed";
    }
  }

  const nextRunAt = computeNextRun({
    triggerType: "NO_CONTACT_FOR",
    triggerConfig: automation.triggerConfig ?? {},
    contact,
    after: now,
  });
  await db
    .update(automations)
    .set({ nextRunAt, updatedAt: sql`now()` })
    .where(eq(automations.id, automation.id));

  return outcome;
}
