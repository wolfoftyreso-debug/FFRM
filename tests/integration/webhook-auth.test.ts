import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb, seedContact, seedOwner, uninstallMocks } from "./helpers";
import type { Db } from "@/lib/db";
import { POST as smsWebhook } from "@/app/api/webhooks/46elks/sms/route";
import { getSystemHealth } from "@/lib/queries";
import * as schema from "@/lib/db/schema";

let db: Db;

function inbound(token?: string) {
  const query = token === undefined ? "" : `?token=${encodeURIComponent(token)}`;
  return new NextRequest(`http://localhost/api/webhooks/46elks/sms${query}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      id: `sAUTH${Math.random().toString(36).slice(2, 10)}`,
      from: "+46700000001",
      to: "+46766861234",
      message: "Hej!",
    }),
  });
}

describe("webhook authentication", () => {
  beforeEach(async () => {
    db = await createTestDb();
    const owner = await seedOwner(db);
    await seedContact(db, owner.id, { autonomyLevel: 0 });
  });
  afterEach(() => {
    delete process.env.WEBHOOK_TOKEN;
    uninstallMocks();
  });

  it("rejects a wrong token when one is configured", async () => {
    process.env.WEBHOOK_TOKEN = "correct-horse";

    const response = await smsWebhook(inbound("wrong-horse"));

    expect(response.status).toBe(401);
    expect(await db.select().from(schema.messages)).toHaveLength(0);
  });

  it("rejects a missing token when one is configured", async () => {
    process.env.WEBHOOK_TOKEN = "correct-horse";

    const response = await smsWebhook(inbound());

    expect(response.status).toBe(401);
    expect(await db.select().from(schema.messages)).toHaveLength(0);
  });

  it("accepts the configured token", async () => {
    process.env.WEBHOOK_TOKEN = "correct-horse";

    const response = await smsWebhook(inbound("correct-horse"));

    expect(response.status).toBe(200);
    expect(await db.select().from(schema.messages)).toHaveLength(1);
  });

  it("rejects a token that only shares a prefix", async () => {
    process.env.WEBHOOK_TOKEN = "correct-horse";

    const response = await smsWebhook(inbound("correct"));

    expect(response.status).toBe(401);
  });

  it("stays open without a token, and reports itself as unprotected", async () => {
    delete process.env.WEBHOOK_TOKEN;

    const response = await smsWebhook(inbound());

    // A phone that stops accepting calls over a missing env var is its own
    // outage — but the exposure must be visible rather than silent.
    expect(response.status).toBe(200);
    expect((await getSystemHealth()).webhooksProtected).toBe(false);
  });

  it("reports itself as protected once a token is configured", async () => {
    process.env.WEBHOOK_TOKEN = "correct-horse";

    expect((await getSystemHealth()).webhooksProtected).toBe(true);
  });
});
