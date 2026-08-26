import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { systemState } from "@/lib/db/schema";

export type MessagingProviderName = "46elks" | "twilio";

export async function getActiveMessagingProvider(): Promise<MessagingProviderName> {
  const db = await getDb();
  const [row] = await db
    .select({ value: systemState.value })
    .from(systemState)
    .where(eq(systemState.key, "messagingProvider"))
    .limit(1);
  return row?.value === "twilio" ? "twilio" : "46elks";
}

export async function setActiveMessagingProvider(
  provider: MessagingProviderName,
): Promise<void> {
  const db = await getDb();
  await db
    .insert(systemState)
    .values({ key: "messagingProvider", value: provider })
    .onConflictDoUpdate({
      target: systemState.key,
      set: { value: provider, updatedAt: sql`now()` },
    });
}

export async function getActiveMessagingSender(): Promise<{
  provider: MessagingProviderName;
  fromNumber: string;
}> {
  const provider = await getActiveMessagingProvider();
  if (provider === "twilio") {
    const { getTwilioCredentials } = await import("@/lib/providers/config");
    return {
      provider,
      fromNumber: (await getTwilioCredentials()).fromNumber,
    };
  }
  const { getElksCredentials } = await import("@/lib/providers/config");
  return {
    provider,
    fromNumber: (await getElksCredentials()).fromNumber,
  };
}
