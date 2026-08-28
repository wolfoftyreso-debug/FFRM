import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  seedOwner,
  seedContact,
  installMockProvider,
  installMockAi,
  uninstallMocks,
} from "./helpers";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { runDispatcher } from "@/lib/automations/dispatcher";
import { eq } from "drizzle-orm";

let db: Db;

const days = (n: number) => n * 24 * 3600 * 1000;

describe("NO_CONTACT_FOR reminder", () => {
  beforeEach(async () => {
    db = await createTestDb();
    installMockProvider();
    installMockAi({});
  });
  afterEach(() => uninstallMocks());

  async function setup(lastInteractionAt: Date | null) {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { lastInteractionAt });
    const [automation] = await db
      .insert(schema.automations)
      .values({
        name: "Remind me to call Mum",
        triggerType: "NO_CONTACT_FOR",
        triggerConfig: { days: 10 },
        actionType: "REMIND_USER",
        actionConfig: { title: "Ring mamma", notifyBySms: false },
        contactId: contact.id,
        nextRunAt: new Date(Date.now() - 1000),
      })
      .returning();
    return { contact, automation };
  }

  it("creates the reminder exactly once per inactivity episode", async () => {
    const { automation } = await setup(new Date(Date.now() - days(11)));

    await runDispatcher();
    let all = await db.select().from(schema.reminders);
    expect(all).toHaveLength(1);
    expect(all[0].title).toBe("Ring mamma");

    // Force it due again — same inactivity episode ⇒ no second reminder.
    await db
      .update(schema.automations)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(schema.automations.id, automation.id));
    await runDispatcher();
    all = await db.select().from(schema.reminders);
    expect(all).toHaveLength(1);
  });

  it("does not fire when recent interaction exists", async () => {
    await setup(new Date(Date.now() - days(2)));
    await runDispatcher();
    const all = await db.select().from(schema.reminders);
    expect(all).toHaveLength(0);
  });

  it("re-arms after a new interaction followed by new inactivity", async () => {
    const { contact, automation } = await setup(new Date(Date.now() - days(11)));
    await runDispatcher();
    expect(await db.select().from(schema.reminders)).toHaveLength(1);

    // New interaction resets the episode …
    await db
      .update(schema.contacts)
      .set({ lastInteractionAt: new Date(Date.now() - days(12)) }) // …then time passes again
      .where(eq(schema.contacts.id, contact.id));
    await db
      .update(schema.automations)
      .set({ nextRunAt: new Date(Date.now() - 1000) })
      .where(eq(schema.automations.id, automation.id));

    await runDispatcher();
    expect(await db.select().from(schema.reminders)).toHaveLength(2);
  });

  it("fires for never-contacted contacts", async () => {
    await setup(null);
    await runDispatcher();
    expect(await db.select().from(schema.reminders)).toHaveLength(1);
  });
});
