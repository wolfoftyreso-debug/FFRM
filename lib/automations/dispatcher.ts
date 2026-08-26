import { getDb } from "@/lib/db";
import {
  automations,
  automationExecutions,
  contacts,
  messages,
  systemState,
  type Automation,
  type Contact,
} from "@/lib/db/schema";
import { and, eq, isNull, isNotNull, lte, lt, sql } from "drizzle-orm";
import { computeNextRun, occurrenceKeyFor } from "./recurrence";
import { executeAutomation } from "./engine";
import { touchSystemState } from "@/lib/system-state";
import { ensureSystemAutomations } from "@/lib/automations/system";

export interface DispatchSummary {
  locked: boolean;
  due: number;
  executed: number;
  retried: number;
  staleRecovered: number;
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

  const summary: DispatchSummary = {
    locked: false,
    due: 0,
    executed: 0,
    retried: 0,
    staleRecovered: 0,
    skipped: 0,
    failed: 0,
    inboundProcessed: 0,
  };

  const leaseToken = new Date(now.getTime() + 55_000).toISOString();
  const insertedLease = await db
    .insert(systemState)
    .values({ key: "cronLease", value: leaseToken })
    .onConflictDoNothing()
    .returning({ key: systemState.key });
  const acquired =
    insertedLease.length > 0
      ? insertedLease
      : await db
          .update(systemState)
          .set({ value: leaseToken, updatedAt: sql`now()` })
          .where(
            and(
              eq(systemState.key, "cronLease"),
              lte(systemState.value, now.toISOString()),
            ),
          )
          .returning({ key: systemState.key });
  if (acquired.length === 0) {
    summary.locked = true;
    return summary;
  }

  try {
    await touchSystemState("lastCronAt");
    await ensureSystemAutomations(now);

    // A crashed RUNNING execution is ambiguous: an external side effect may
    // already have happened. Mark it terminal and visible; never blindly resend.
    const staleRunning = await db
      .update(automationExecutions)
      .set({
        status: "FAILED",
        completedAt: now,
        retryCount: 3,
        nextRetryAt: null,
        error:
          "Execution lease expired; side-effect outcome is ambiguous. Manual review required.",
      })
      .where(
        and(
          eq(automationExecutions.status, "RUNNING"),
          lt(
            automationExecutions.startedAt,
            new Date(now.getTime() - 10 * 60 * 1000),
          ),
        ),
      )
      .returning({ id: automationExecutions.id });
    summary.staleRecovered = staleRunning.length;

    const ambiguousOutbound = await db
      .update(messages)
      .set({
        status: "SENT_UNKNOWN",
        error:
          "Outbound provider outcome is unknown after process interruption; automatic resend blocked.",
      })
      .where(
        and(
          eq(messages.direction, "OUTBOUND"),
          eq(messages.status, "PENDING"),
          lt(messages.createdAt, new Date(now.getTime() - 10 * 60 * 1000)),
        ),
      )
      .returning({ id: messages.id });
    summary.staleRecovered += ambiguousOutbound.length;

    // Retry explicit failures with 1m/2m backoff. executeAutomation reclaims
    // the same occurrence row, so there is still one permanent audit record.
    const retries = await db
      .select({ execution: automationExecutions, automation: automations })
      .from(automationExecutions)
      .innerJoin(
        automations,
        eq(automationExecutions.automationId, automations.id),
      )
      .where(
        and(
          eq(automationExecutions.status, "FAILED"),
          eq(automations.enabled, true),
          lt(automationExecutions.retryCount, 3),
          lte(automationExecutions.nextRetryAt, now),
        ),
      )
      .limit(20);
    for (const row of retries) {
      const result = await executeAutomation({
        automation: row.automation,
        occurrenceKey: row.execution.occurrenceKey,
        scheduledFor: row.execution.scheduledFor,
        triggerPayload: row.execution.triggerPayload,
        now,
      });
      if (result.executed) summary.retried++;
    }

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

  // Fallback processing of voicemail recordings whose post-webhook
  // processing did not complete.
    const { findUnprocessedRecordings } = await import("@/lib/voice/service");
  const { processCallRecording } = await import("@/lib/voice/process-recording");
    const staleRecordings = await findUnprocessedRecordings(
    new Date(now.getTime() - 90 * 1000),
  );
    for (const r of staleRecordings) {
    await processCallRecording(r.id);
  }

    const { findStylesNeedingRetry, processContactStyle } = await import(
      "@/lib/ai/process-style"
    );
    for (const contactId of await findStylesNeedingRetry()) {
      await processContactStyle(contactId);
    }

  // Fallback processing of inbound messages whose post-webhook processing
  // did not complete (e.g. function terminated). Never lose communication.
    const staleCutoff = new Date(now.getTime() - 90 * 1000);
    const unprocessed = await db
    .select({ id: messages.id, channel: messages.channel })
    .from(messages)
    .where(
      and(
        eq(messages.direction, "INBOUND"),
        isNull(messages.processedAt),
        lt(messages.createdAt, staleCutoff),
      ),
    )
    .limit(20);
    const { processCampaignQueue } = await import("@/lib/sms/campaign");
    await processCampaignQueue(now);
    const { processCallbackNotifications } = await import(
      "@/lib/voice/receptionist"
    );
    await processCallbackNotifications(now);
    const { pollPendingApolloPhones } = await import("@/lib/apollo/service");
    await pollPendingApolloPhones();

    for (const m of unprocessed) {
    if (m.channel === "MMS") {
      const { processInboundMms } = await import("@/lib/mms/process-inbound");
      await processInboundMms(m.id);
    } else {
      const { processInboundSmsEvent } = await import(
        "@/lib/automations/events"
      );
      await processInboundSmsEvent(m.id);
    }
    summary.inboundProcessed++;
    }

    return summary;
  } finally {
    await db
      .update(systemState)
      .set({ value: new Date(0).toISOString(), updatedAt: sql`now()` })
      .where(
        and(
          eq(systemState.key, "cronLease"),
          eq(systemState.value, leaseToken),
        ),
      );
  }
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
