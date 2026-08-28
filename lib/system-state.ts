import { getDb } from "@/lib/db";
import { systemState } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export type SystemStateKey =
  | "lastCronAt"
  | "lastWebhookAt"
  | "lastAiAt"
  | "lastSmsSentAt"
  | "lastInsightSweepAt";

export async function setSystemState(
  key: SystemStateKey,
  value: string,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(systemState)
    .values({ key, value })
    .onConflictDoUpdate({
      target: systemState.key,
      set: { value, updatedAt: sql`now()` },
    });
}

export async function getSystemState(): Promise<Record<string, string>> {
  const db = await getDb();
  const rows = await db.select().from(systemState);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function touchSystemState(key: SystemStateKey): Promise<void> {
  await setSystemState(key, new Date().toISOString());
}
