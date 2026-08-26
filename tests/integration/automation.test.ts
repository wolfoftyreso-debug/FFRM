import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  seedOwner,
  seedContact,
  installMockProvider,
  installMockAi,
  uninstallMocks,
  type MockMessagingProvider,
} from "./helpers";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { executeAutomation } from "@/lib/automations/engine";
import { runDispatcher } from "@/lib/automations/dispatcher";
import { eq } from "drizzle-orm";
import { listConversations } from "@/lib/queries";

let db: Db;
let provider: MockMessagingProvider;

async function createBirthdayAutomation(
  contactId: string,
  nextRunAt: Date | null,
  autonomyLevel = 4,
) {
  const [automation] = await db
    .insert(schema.automations)
    .values({
      name: "Birthday greeting",
      triggerType: "BIRTHDAY",
      triggerConfig: { time: "09:00" },
      actionType: "GENERATE_SMS",
      actionConfig: { purpose: "birthday" },
      contactId,
      autonomyLevel,
      nextRunAt,
    })
    .returning();
  return automation;
}

describe("automation engine", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
    installMockAi({ generatedText: "Grattis på födelsedagen, Johan! 🎉" });
  });
  afterEach(() => uninstallMocks());

  it("executes GENERATE_SMS: AI text is generated, sent and fully recorded", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const automation = await createBirthdayAutomation(contact.id, new Date());

    const result = await executeAutomation({
      automation,
      occurrenceKey: "birthday-2026-03-15",
      scheduledFor: new Date(),
    });

    expect(result.executed).toBe(true);
    expect(result.status).toBe("COMPLETED");
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].text).toContain("Grattis");

    const [execution] = await db.select().from(schema.automationExecutions);
    expect(execution.status).toBe("COMPLETED");
    expect(execution.aiModel).toBeTruthy();
    expect(execution.aiInputTokens).toBe(100);

    const [message] = await db.select().from(schema.messages);
    expect(message.providerMessageId).toBe("sTEST1");
    expect(message.automationExecutionId).toBe(execution.id);
    expect(message.sender).toBe("AI");
    const automaticEvents = (await db.select().from(schema.messages)).filter(
      (m) => m.channel === "AUTOMATION",
    );
    expect(automaticEvents).toHaveLength(1);
    expect(automaticEvents[0].text).toContain("Birthday greeting · COMPLETED");
    const inbox = await listConversations();
    expect(inbox[0].isAutomated).toBe(true);
    expect(inbox[0].unread).toBe(true);
  });

  it("calendar GENERATE_DRAFT always creates a draft and never sends", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 0 });
    const [automation] = await db
      .insert(schema.automations)
      .values({
        name: "Alla hjärtans dag – Johan",
        triggerType: "ANNIVERSARY",
        triggerConfig: {
          date: "2026-02-14",
          time: "09:00",
          yearly: true,
          eventKind: "VALENTINES_DAY",
          randomMinute: true,
          randomMinuteSeed: "stable-seed",
        },
        actionType: "GENERATE_DRAFT",
        actionConfig: { purpose: "alla hjärtans dag" },
        contactId: contact.id,
        autonomyLevel: 2,
        nextRunAt: new Date(),
      })
      .returning();

    const result = await executeAutomation({
      automation,
      occurrenceKey: "anniversary-2026-02-14",
      scheduledFor: new Date(),
    });
    expect(result.status).toBe("ESCALATED");
    expect(provider.sent).toHaveLength(0);
    const [draft] = await db
      .select()
      .from(schema.reminders)
      .where(eq(schema.reminders.automationId, automation.id));
    expect(draft.kind).toBe("DRAFT");
    expect(draft.draftText).toContain("Grattis");
  });

  it("is idempotent: the same occurrence can never send twice", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const automation = await createBirthdayAutomation(contact.id, new Date());

    const key = "birthday-2026-03-15";
    const first = await executeAutomation({
      automation,
      occurrenceKey: key,
      scheduledFor: new Date(),
    });
    const second = await executeAutomation({
      automation,
      occurrenceKey: key,
      scheduledFor: new Date(),
    });

    expect(first.executed).toBe(true);
    expect(second.executed).toBe(false);
    expect(second.status).toBe("DUPLICATE");
    expect(provider.sent).toHaveLength(1);

    const executions = await db.select().from(schema.automationExecutions);
    expect(executions).toHaveLength(1);
  });

  it("queues a draft instead of sending at autonomy 3", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 3 });
    const automation = await createBirthdayAutomation(contact.id, new Date(), 3);

    const result = await executeAutomation({
      automation,
      occurrenceKey: "birthday-2026-03-15",
      scheduledFor: new Date(),
    });

    expect(result.status).toBe("ESCALATED");
    expect(provider.sent).toHaveLength(0);
    const drafts = await db.select().from(schema.reminders);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].kind).toBe("DRAFT");
    expect(drafts[0].draftText).toContain("Grattis");
  });

  it("the contact's stricter autonomy caps the automation's", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 2 });
    const automation = await createBirthdayAutomation(contact.id, new Date(), 4);
    const result = await executeAutomation({
      automation,
      occurrenceKey: "k1",
      scheduledFor: new Date(),
    });
    expect(result.status).toBe("ESCALATED"); // draft, not sent
    expect(provider.sent).toHaveLength(0);
  });
});

describe("dispatcher", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
    installMockAi({ generatedText: "Grattis på födelsedagen! 🎉" });
  });
  afterEach(() => uninstallMocks());

  it("runs due jobs, records execution and advances nextRunAt to next year", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const due = new Date(Date.now() - 60_000);
    const automation = await createBirthdayAutomation(contact.id, due);

    const summary = await runDispatcher();
    expect(summary.due).toBe(1);
    expect(summary.executed).toBe(1);
    expect(provider.sent).toHaveLength(1);

    const [updated] = await db
      .select()
      .from(schema.automations)
      .where(eq(schema.automations.id, automation.id));
    expect(updated.nextRunAt).not.toBeNull();
    expect(updated.nextRunAt!.getTime()).toBeGreaterThan(Date.now());
    expect(updated.lastRunAt).not.toBeNull();

    // A second dispatcher run must not re-execute anything.
    const again = await runDispatcher();
    expect(again.executed).toBe(0);
    expect(provider.sent).toHaveLength(1);
  });

  it("ignores non-due and disabled automations", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    await createBirthdayAutomation(
      contact.id,
      new Date(Date.now() + 24 * 3600_000),
    );
    const [disabled] = await db
      .insert(schema.automations)
      .values({
        name: "Disabled",
        triggerType: "INTERVAL",
        triggerConfig: { days: 1 },
        actionType: "REMIND_USER",
        actionConfig: {},
        contactId: contact.id,
        enabled: false,
        nextRunAt: new Date(Date.now() - 1000),
      })
      .returning();
    expect(disabled.enabled).toBe(false);

    const summary = await runDispatcher();
    expect(summary.due).toBe(0);
    expect(summary.executed).toBe(0);
  });
});
