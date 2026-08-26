import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";

/** Race-safe single-owner bootstrap for a freshly migrated production DB. */
export async function ensureOwner(): Promise<void> {
  const db = await getDb();
  await db
    .insert(users)
    .values({
      singletonKey: "owner",
      name: "Owner",
      preferredLanguage: "sv",
      timezone: process.env.DEFAULT_TIMEZONE ?? "Europe/Stockholm",
      voiceProfile: {
        defaultTone: "warm, informal",
        emojiUsage: "light",
        formality: "casual",
      },
    })
    .onConflictDoNothing();
}
