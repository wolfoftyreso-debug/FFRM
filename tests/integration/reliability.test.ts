import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  installMockAi,
  installMockProvider,
  lowRiskAutoReply,
  seedContact,
  seedOwner,
  uninstallMocks,
  type MockMessagingProvider,
} from "./helpers";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { processInboundMessage } from "@/lib/inbound";
import { runDispatcher } from "@/lib/automations/dispatcher";
import { POST as deliveryWebhook } from "@/app/api/webhooks/46elks/delivery/route";
import { GET as cronEndpoint } from "@/app/api/cron/dispatcher/route";
import { GET as mediaEndpoint } from "@/app/api/media/[id]/route";
import { processContactStyle } from "@/lib/ai/process-style";

let db: Db;
let provider: MockMessagingProvider;

function formRequest(path: string, body: Record<string, string>) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
}

describe("production reliability", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
  });
  afterEach(() => uninstallMocks());

  it("escalates when an approved AI auto-reply fails to send", async () => {
    installMockAi({ triage: lowRiskAutoReply });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const [message] = await db
      .insert(schema.messages)
      .values({
        conversationId,
        contactId: contact.id,
        direction: "INBOUND",
        providerMessageId: "sSENDFAIL",
        fromNumber: contact.phoneNumber!,
        toNumber: "+46766861234",
        text: "Tack!",
        status: "RECEIVED",
      })
      .returning();
    provider.failNext = true;
    await processInboundMessage(message.id);

    const [conversation] = await db.select().from(schema.conversations);
    expect(conversation.aiControlState).toBe("ESCALATED");
    expect(conversation.escalationReason).toContain("failed to send");
    const [processed] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, message.id));
    expect(processed.processedAt).not.toBeNull();
    // Contact send failed; owner escalation notification succeeded.
    expect(provider.sent.filter((m) => m.to === "+46700000099")).toHaveLength(1);
  });

  it("creates exactly one open conversation under concurrent requests", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const ids = await Promise.all(
      Array.from({ length: 8 }, () =>
        getOrCreateConversation(contact.id, contact.phoneNumber!),
      ),
    );
    expect(new Set(ids).size).toBe(1);
    expect(await db.select().from(schema.conversations)).toHaveLength(1);
  });

  it("delivery status is monotonic and cannot regress after DELIVERED", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const [message] = await db
      .insert(schema.messages)
      .values({
        contactId: contact.id,
        direction: "OUTBOUND",
        providerMessageId: "sDELIVERY1",
        fromNumber: "+46766861234",
        toNumber: contact.phoneNumber!,
        text: "Hej",
        status: "SENT",
      })
      .returning();
    expect(
      (
        await deliveryWebhook(
          formRequest("/api/webhooks/46elks/delivery", {
            id: "sDELIVERY1",
            status: "delivered",
          }),
        )
      ).status,
    ).toBe(200);
    await deliveryWebhook(
      formRequest("/api/webhooks/46elks/delivery", {
        id: "sDELIVERY1",
        status: "failed",
      }),
    );
    const [stored] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, message.id));
    expect(stored.status).toBe("DELIVERED");
  });

  it("cron endpoint enforces auth and a lease prevents overlap", async () => {
    const unauthorized = await cronEndpoint(
      new NextRequest("http://localhost/api/cron/dispatcher"),
    );
    expect(unauthorized.status).toBe(401);
    await db.insert(schema.systemState).values({
      key: "cronLease",
      value: new Date(Date.now() + 60_000).toISOString(),
    });
    const authorized = await cronEndpoint(
      new NextRequest("http://localhost/api/cron/dispatcher", {
        headers: { authorization: "Bearer cron-test-secret" },
      }),
    );
    expect(authorized.status).toBe(200);
    expect((await authorized.json()).locked).toBe(true);
  });

  it("retries explicit automation failure and never retries stale ambiguous RUNNING", async () => {
    installMockAi({ generatedText: "Hej från automationen" });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const [automation] = await db
      .insert(schema.automations)
      .values({
        name: "Retry me",
        triggerType: "DATE",
        triggerConfig: { date: "2026-08-26" },
        actionType: "SEND_SMS",
        actionConfig: { text: "Hej" },
        contactId: contact.id,
        autonomyLevel: 4,
        nextRunAt: new Date(Date.now() - 1_000),
      })
      .returning();
    provider.failNext = true;
    await runDispatcher(new Date());
    let [execution] = await db.select().from(schema.automationExecutions);
    expect(execution.status).toBe("FAILED");
    expect(execution.retryCount).toBe(1);
    const retryTime = new Date(execution.nextRetryAt!.getTime() + 1_000);
    const retrySummary = await runDispatcher(retryTime);
    expect(retrySummary.retried).toBe(1);
    [execution] = await db.select().from(schema.automationExecutions);
    expect(execution.status).toBe("COMPLETED");
    expect(provider.sent.filter((m) => m.to === contact.phoneNumber)).toHaveLength(
      1,
    );

    await db.insert(schema.automationExecutions).values({
      automationId: automation.id,
      contactId: contact.id,
      occurrenceKey: "ambiguous-stale",
      scheduledFor: new Date(),
      status: "RUNNING",
      startedAt: new Date(Date.now() - 20 * 60_000),
    });
    const staleSummary = await runDispatcher(new Date(Date.now() + 2_000));
    expect(staleSummary.staleRecovered).toBe(1);
    const stale = (await db.select().from(schema.automationExecutions)).find(
      (e) => e.occurrenceKey === "ambiguous-stale",
    )!;
    expect(stale.retryCount).toBe(3);
    expect(stale.error).toContain("ambiguous");
  });

  it("serves stored media with private no-sniff headers", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const [message] = await db
      .insert(schema.messages)
      .values({
        conversationId,
        contactId: contact.id,
        direction: "INBOUND",
        channel: "MMS",
        contentType: "IMAGE",
        providerMessageId: "mMEDIA",
        fromNumber: contact.phoneNumber!,
        toNumber: "+46766861234",
        text: "",
        status: "RECEIVED",
      })
      .returning();
    const bytes = Buffer.from("safe-image-bytes");
    const [asset] = await db
      .insert(schema.mediaAssets)
      .values({
        conversationId,
        messageId: message.id,
        mimeType: "image/jpeg",
        dataBase64: bytes.toString("base64"),
        byteSize: bytes.length,
        storageUrl: "/api/media/x",
      })
      .returning();
    const response = await mediaEndpoint(new Request("http://localhost"), {
      params: Promise.resolve({ id: asset.id }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("rebuilds a contact communication profile from persisted screenshots", async () => {
    installMockAi({});
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const image = await sharp({
      create: {
        width: 200,
        height: 300,
        channels: 3,
        background: { r: 250, g: 250, b: 250 },
      },
    })
      .jpeg()
      .toBuffer();
    await db.insert(schema.contactMedia).values({
      contactId: contact.id,
      mimeType: "image/jpeg",
      dataBase64: image.toString("base64"),
      analysisStatus: "PENDING",
    });
    expect(await processContactStyle(contact.id)).toBe(true);
    const [updated] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.id, contact.id));
    expect(updated.communicationProfile?.ownerStyle?.language).toBe("sv");
    expect(updated.communicationProfile?.recurringExpressions).toContain("haha");
    const [media] = await db.select().from(schema.contactMedia);
    expect(media.analysisStatus).toBe("COMPLETED");
  });
});
