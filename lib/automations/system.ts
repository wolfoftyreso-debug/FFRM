import { getDb } from "@/lib/db";
import { automations, users } from "@/lib/db/schema";
import { computeNextRun } from "@/lib/automations/recurrence";

const INSIGHT_AUTOMATION_ID = "system-twice-daily-insight-review";

/** Ensures the built-in 08:00/20:00 review exists in every environment. */
export async function ensureSystemAutomations(now = new Date()): Promise<void> {
  const db = await getDb();
  const [owner] = await db
    .select({ timezone: users.timezone })
    .from(users)
    .limit(1);
  const triggerConfig = { cron: "0 8,20 * * *" };
  await db
    .insert(automations)
    .values({
      id: INSIGHT_AUTOMATION_ID,
      name: "Twice-daily conversation review",
      description:
        "At 08:00 and 20:00, review recent messages and call transcripts for quote-grounded decisions and notes.",
      enabled: true,
      triggerType: "CRON",
      triggerConfig,
      actionType: "EXTRACT_INSIGHTS",
      actionConfig: { lookbackHours: 13, contactLimit: 30 },
      autonomyLevel: 0,
      nextRunAt: computeNextRun({
        triggerType: "CRON",
        triggerConfig,
        after: now,
        timezone: owner?.timezone,
      }),
    })
    .onConflictDoNothing();
}

