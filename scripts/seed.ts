/**
 * Development seed data. Creates the owner user and (in development) the
 * "Johan" test contact used by the end-to-end verification flow.
 *
 * Safe to run repeatedly — it never duplicates data.
 */
import { getDb } from "../lib/db";
import { contacts, users, automations } from "../lib/db/schema";
import { computeNextRun } from "../lib/automations/recurrence";
import { eq } from "drizzle-orm";
import { ensureSystemAutomations } from "../lib/automations/system";

async function main() {
  const db = await getDb();

  let [owner] = await db.select().from(users).limit(1);
  if (!owner) {
    [owner] = await db
      .insert(users)
      .values({
        name: process.env.SEED_OWNER_NAME ?? "Owner",
        phoneNumber: process.env.OWNER_PHONE_NUMBER ?? null,
        preferredLanguage: "sv",
        timezone: process.env.DEFAULT_TIMEZONE ?? "Europe/Stockholm",
        voiceProfile: {
          defaultTone: "warm, informal",
          emojiUsage: "light",
          formality: "casual",
        },
      })
      .returning();
    console.log("Created owner user:", owner.name);
  } else {
    console.log("Owner user exists:", owner.name);
  }
  await ensureSystemAutomations();

  // Dev-only test contact "Johan" — never seeded in production.
  if (process.env.NODE_ENV !== "production" || process.env.SEED_TEST_CONTACT === "true") {
    const johanPhone = process.env.SEED_JOHAN_PHONE ?? "+46700000001";
    const existing = await db
      .select()
      .from(contacts)
      .where(eq(contacts.phoneNumber, johanPhone))
      .limit(1);
    if (existing.length === 0) {
      const [johan] = await db
        .insert(contacts)
        .values({
          userId: owner.id,
          firstName: "Johan",
          lastName: "Testsson",
          phoneNumber: johanPhone,
          birthday: "1988-03-15",
          relationshipType: "FRIEND",
          importance: "HIGH",
          preferredLanguage: "sv",
          timezone: "Europe/Stockholm",
          communicationStyle: "informal, short messages",
          emojiStyle: "light",
          humorAllowed: true,
          desiredContactCadenceDays: 30,
          autonomyLevel: 4,
          automaticBirthdayGreeting: true,
          notes: "Dev test contact for the end-to-end flow.",
        })
        .returning();
      console.log("Created test contact Johan:", johan.id);

      const birthdayNextRun = computeNextRun({
        triggerType: "BIRTHDAY",
        triggerConfig: { time: "09:00" },
        contact: johan,
        after: new Date(),
      });
      await db.insert(automations).values([
        {
          name: "Johans födelsedagshälsning",
          description: "Generate and send a personal birthday greeting.",
          triggerType: "BIRTHDAY",
          triggerConfig: { time: "09:00" },
          actionType: "GENERATE_SMS",
          actionConfig: { purpose: "birthday" },
          contactId: johan.id,
          autonomyLevel: 4,
          nextRunAt: birthdayNextRun,
        },
        {
          name: "Johan test: skicka vänligt SMS",
          description: "Manual test automation — run from the automation page.",
          triggerType: "MANUAL",
          triggerConfig: {},
          actionType: "GENERATE_SMS",
          actionConfig: { purpose: "checkin" },
          contactId: johan.id,
          autonomyLevel: 4,
          nextRunAt: null,
        },
      ]);
      console.log("Created Johan test automations.");
    } else {
      console.log("Test contact Johan already exists.");
    }
  }

  console.log("Seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
