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
import { sendMessage } from "@/lib/sms/send-message";

let db: Db;
let provider: MockMessagingProvider;

describe("outbound SMS service", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
  });
  afterEach(() => uninstallMocks());

  it("persists, sends and stores the provider message id", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);

    const result = await sendMessage({
      to: contact.phoneNumber!,
      text: "Hej Johan!",
      sender: "USER",
      contactId: contact.id,
    });

    expect(result.ok).toBe(true);
    expect(result.message.status).toBe("SENT");
    expect(result.message.providerMessageId).toBe("sTEST1");
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].to).toBe("+46700000001");

    const activity = await db.select().from(schema.activityLog);
    expect(activity.some((a) => a.action === "SMS_SENT")).toBe(true);
  });

  it("records failure without losing the message", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    provider.failNext = true;

    const result = await sendMessage({
      to: contact.phoneNumber!,
      text: "Hej!",
      sender: "AI",
      contactId: contact.id,
    });

    expect(result.ok).toBe(false);
    expect(result.message.status).toBe("FAILED");
    expect(result.message.error).toContain("simulated provider failure");

    const stored = await db.select().from(schema.messages);
    expect(stored).toHaveLength(1); // record persisted despite failure
    const activity = await db.select().from(schema.activityLog);
    expect(activity.some((a) => a.action === "SMS_FAILED")).toBe(true);
  });

  it("rejects non-E.164 recipients", async () => {
    await expect(
      sendMessage({ to: "0701234567", text: "x", sender: "USER" }),
    ).rejects.toThrow(/E\.164/);
  });
});
