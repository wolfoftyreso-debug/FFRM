import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  seedOwner,
  seedContact,
  installMockProvider,
  uninstallMocks,
  type MockMessagingProvider,
} from "./helpers";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import {
  createBroadcastCampaign,
  processCampaignQueue,
} from "@/lib/sms/campaign";

let db: Db;
let provider: MockMessagingProvider;

describe("broadcast campaigns", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
  });
  afterEach(() => uninstallMocks());

  it("saves a batch from contacts plus an imported list and personalizes *namn*", async () => {
    const owner = await seedOwner(db);
    const johan = await seedContact(db, owner.id);
    const maja = await seedContact(db, owner.id, {
      firstName: "Maja",
      lastName: "Lind",
      phoneNumber: "+46700000002",
    });

    const created = await createBroadcastCampaign({
      templateText: "Hej *namn*, lunch?",
      personalized: true,
      contactIds: [johan.id, maja.id],
      importedText: "+46700000002, Duplicate\n0700000003, Pia",
    });

    expect(created.total).toBe(3);
    const recipients = await db.select().from(schema.campaignRecipients);
    expect(recipients).toHaveLength(3);
    expect(
      recipients.map((row) => row.renderedText).sort(),
    ).toEqual([
      "Hej Johan, lunch?",
      "Hej Maja, lunch?",
      "Hej Pia, lunch?",
    ]);

    const first = await processCampaignQueue();
    expect(first.sent).toBe(3);
    expect(provider.sent).toHaveLength(3);
    expect(provider.sent.map((sms) => sms.to).sort()).toEqual([
      "+46700000001",
      "+46700000002",
      "+46700000003",
    ]);

    const second = await processCampaignQueue();
    expect(second.sent).toBe(0);
    expect(provider.sent).toHaveLength(3);

    const [campaign] = await db.select().from(schema.messageCampaigns);
    expect(campaign.status).toBe("COMPLETED");
    expect(campaign.sentCount).toBe(3);
  });

  it("does not send the same phone twice in one campaign", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    await createBroadcastCampaign({
      templateText: "Hej",
      personalized: false,
      contactIds: [contact.id, contact.id],
      importedText: "0700000001\n+46700000001",
    });
    const recipients = await db.select().from(schema.campaignRecipients);
    expect(recipients).toHaveLength(1);
  });

  it("retries a failed send and then marks it failed", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    await createBroadcastCampaign({
      templateText: "Hej",
      personalized: false,
      contactIds: [contact.id],
    });

    provider.failNext = true;
    expect(await processCampaignQueue()).toEqual({ sent: 0, failed: 1 });
    expect(await processCampaignQueue()).toEqual({ sent: 1, failed: 0 });
    expect(provider.sent).toHaveLength(1);

    const [campaign] = await db.select().from(schema.messageCampaigns);
    expect(campaign.status).toBe("COMPLETED");
    expect(campaign.sentCount).toBe(1);
  });
});
