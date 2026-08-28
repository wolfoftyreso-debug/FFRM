import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  createTestDb,
  seedOwner,
  seedContact,
  installMockProvider,
  installMockAi,
  uninstallMocks,
  defaultEscalate,
} from "./helpers";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { POST as smsWebhook } from "@/app/api/webhooks/46elks/sms/route";

function elksRequest(body: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/46elks/sms", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

let db: Db;

describe("46elks inbound webhook", () => {
  beforeEach(async () => {
    db = await createTestDb();
    installMockProvider();
    installMockAi({ triage: defaultEscalate });
  });
  afterEach(() => uninstallMocks());

  it("persists the message before any AI work and resolves the contact", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);

    const res = await smsWebhook(
      elksRequest({
        id: "sf8425555e5d8db61dda7a7b3f1b91bdb",
        from: "+46700000001",
        to: "+46766861234",
        message: "Hej! Hur är läget?",
        direction: "incoming",
        created: "2026-08-26 09:00:00",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(""); // body would be sent back as SMS

    const stored = await db.select().from(schema.messages);
    expect(stored).toHaveLength(1);
    expect(stored[0].contactId).toBe(contact.id);
    expect(stored[0].direction).toBe("INBOUND");
    expect(stored[0].providerMessageId).toBe(
      "sf8425555e5d8db61dda7a7b3f1b91bdb",
    );
    expect(stored[0].fromNumber).toBe("+46700000001");

    // Conversation created and linked.
    const conversations = await db.select().from(schema.conversations);
    expect(conversations).toHaveLength(1);
    expect(conversations[0].contactId).toBe(contact.id);

    // lastInteractionAt updated.
    const [updated] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, contact.id));
    expect(updated.lastInteractionAt).not.toBeNull();
  });

  it("deduplicates retried webhooks by provider message id", async () => {
    const owner = await seedOwner(db);
    await seedContact(db, owner.id);

    const body = {
      id: "sDUPLICATE1",
      from: "+46700000001",
      to: "+46766861234",
      message: "Samma meddelande",
    };
    const first = await smsWebhook(elksRequest(body));
    const second = await smsWebhook(elksRequest(body));
    const third = await smsWebhook(elksRequest(body));
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(200);

    const stored = await db.select().from(schema.messages);
    // Owner escalation notifications are OUTBOUND; count only inbound.
    const inbound = stored.filter((m) => m.direction === "INBOUND");
    expect(inbound).toHaveLength(1);
  });

  it("accepts messages from unknown senders", async () => {
    await seedOwner(db);
    const res = await smsWebhook(
      elksRequest({
        id: "sUNKNOWN1",
        from: "+46709999999",
        to: "+46766861234",
        message: "Hej, det är Kalle!",
      }),
    );
    expect(res.status).toBe(200);
    const stored = await db.select().from(schema.messages);
    const inbound = stored.filter((m) => m.direction === "INBOUND");
    expect(inbound).toHaveLength(1);
    expect(inbound[0].contactId).toBeNull();
    const conversations = await db.select().from(schema.conversations);
    expect(conversations[0].peerNumber).toBe("+46709999999");
  });

  it("rejects malformed payloads", async () => {
    const res = await smsWebhook(elksRequest({ from: "+46700000001" }));
    expect(res.status).toBe(400);
  });

  it("normalizes national-format sender numbers to E.164", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    await smsWebhook(
      elksRequest({
        id: "sNATIONAL1",
        from: "0700000001",
        to: "+46766861234",
        message: "Nationellt format",
      }),
    );
    const stored = await db.select().from(schema.messages);
    const inbound = stored.filter((m) => m.direction === "INBOUND");
    expect(inbound[0].fromNumber).toBe("+46700000001");
    expect(inbound[0].contactId).toBe(contact.id);
  });
});
