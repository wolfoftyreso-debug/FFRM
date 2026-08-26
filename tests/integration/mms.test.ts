import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedOwner,
  seedContact,
  installMockProvider,
  installMockAi,
  uninstallMocks,
  lowRiskAutoReply,
  defaultEscalate,
  type MockMessagingProvider,
} from "./helpers";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { POST as mmsWebhook } from "@/app/api/webhooks/46elks/mms/route";
import { sendMediaMessage } from "@/lib/mms/send-message";

function formRequest(body: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/46elks/mms", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

let db: Db;
let provider: MockMessagingProvider;
let sampleImage: Buffer;

async function waitForMms(messageId: string) {
  for (let i = 0; i < 100; i++) {
    const [message] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.id, messageId));
    const assets = await db
      .select()
      .from(schema.mediaAssets)
      .where(eq(schema.mediaAssets.messageId, messageId));
    if (
      message?.processedAt &&
      assets.every((a) =>
        ["COMPLETED", "FAILED", "STORED"].includes(a.analysisStatus),
      )
    ) {
      return;
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("MMS processing timed out");
}

describe("MMS pipeline", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
    sampleImage = await sharp({
      create: {
        width: 320,
        height: 200,
        channels: 3,
        background: { r: 180, g: 20, b: 20 },
      },
    })
      .jpeg()
      .toBuffer();
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("api.46elks.com")) {
        const body = sampleImage.buffer.slice(
          sampleImage.byteOffset,
          sampleImage.byteOffset + sampleImage.byteLength,
        ) as ArrayBuffer;
        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "image/jpeg",
            "content-length": String(sampleImage.byteLength),
          },
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;
  });
  afterEach(() => uninstallMocks());

  it("persists MMS metadata before media work and deduplicates provider retries", async () => {
    installMockAi({ triage: lowRiskAutoReply });
    const owner = await seedOwner(db);
    await seedContact(db, owner.id);
    const payload = {
      id: "mIN1",
      from: "+46700000001",
      to: "+46766861234",
      message: "Kolla vilken bil 😂",
      image: "https://api.46elks.com/a1/images/car.jpg",
    };
    const first = await mmsWebhook(formRequest(payload));
    const retry = await mmsWebhook(formRequest(payload));
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);

    const inbound = (await db.select().from(schema.messages)).filter(
      (m) => m.direction === "INBOUND",
    );
    expect(inbound).toHaveLength(1);
    expect(inbound[0].channel).toBe("MMS");
    expect(inbound[0].contentType).toBe("TEXT_AND_IMAGE");
    const assets = await db.select().from(schema.mediaAssets);
    expect(assets).toHaveLength(1);
    expect(assets[0].providerUrl).toBe(payload.image);
    await waitForMms(inbound[0].id);
  });

  it("sanitizes, understands and auto-replies to a low-risk image MMS", async () => {
    installMockAi({ triage: lowRiskAutoReply });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    await mmsWebhook(
      formRequest({
        id: "mIN2",
        from: contact.phoneNumber!,
        to: "+46766861234",
        message: "Kolla vilken bil 😂",
        image: "https://api.46elks.com/a1/images/car.jpg",
      }),
    );
    const [message] = (await db.select().from(schema.messages)).filter(
      (m) => m.direction === "INBOUND",
    );
    await waitForMms(message.id);

    const [asset] = await db.select().from(schema.mediaAssets);
    expect(asset.analysisStatus).toBe("COMPLETED");
    expect(asset.storageUrl).toBe(`/api/media/${asset.id}`);
    expect(asset.mimeType).toBe("image/jpeg");
    expect(asset.width).toBe(320);
    expect(asset.analysis?.caption).toContain("red car");
    expect(asset.analysis?.contextualInterpretation).toContain("Likely");
    expect(asset.analysisModel).toBeTruthy();

    // The image observation is fed into the same triage policy, which emits a
    // low-risk text reply to the contact.
    expect(provider.sent.filter((s) => s.to === contact.phoneNumber)).toHaveLength(1);
    const systemEvents = (await db.select().from(schema.messages)).filter(
      (m) => m.contentType === "SYSTEM",
    );
    expect(systemEvents[0].text).toContain("SMALL_TALK");
  });

  it("escalates purchase/financial image context and does not reply", async () => {
    installMockAi({ triage: defaultEscalate });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    await mmsWebhook(
      formRequest({
        id: "mBUY1",
        from: contact.phoneNumber!,
        to: "+46766861234",
        message: "Funderar på att köpa den. Tycker du jag ska slå till?",
        image: "https://api.46elks.com/a1/images/car.jpg",
      }),
    );
    const [message] = (await db.select().from(schema.messages)).filter(
      (m) => m.direction === "INBOUND",
    );
    await waitForMms(message.id);

    expect(
      provider.sent.filter((s) => s.to === contact.phoneNumber),
    ).toHaveLength(0);
    const [conv] = await db.select().from(schema.conversations);
    expect(conv.aiControlState).toBe("ESCALATED");
    expect(provider.sent.filter((s) => s.to === "+46700000099")).toHaveLength(1);
  });

  it("escalates instead of replying when image retrieval/analysis fails", async () => {
    installMockAi({ triage: lowRiskAutoReply });
    globalThis.fetch = (async () => new Response("no", { status: 500 })) as typeof fetch;
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    await mmsWebhook(
      formRequest({
        id: "mFAIL1",
        from: contact.phoneNumber!,
        to: "+46766861234",
        message: "Vad tror du?",
        image: "https://api.46elks.com/a1/images/broken.jpg",
      }),
    );
    const [message] = (await db.select().from(schema.messages)).filter(
      (m) => m.direction === "INBOUND",
    );
    await waitForMms(message.id);
    const [asset] = await db.select().from(schema.mediaAssets);
    expect(asset.analysisStatus).toBe("FAILED");
    const [conv] = await db.select().from(schema.conversations);
    expect(conv.aiControlState).toBe("ESCALATED");
    expect(
      provider.sent.filter((s) => s.to === contact.phoneNumber),
    ).toHaveLength(0);
  });

  it("sends outbound MMS with sanitized media and stores one unified Message", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const result = await sendMediaMessage({
      to: contact.phoneNumber!,
      text: "Kolla den här!",
      image: sampleImage,
      sender: "USER",
      contactId: contact.id,
    });
    expect(result.ok).toBe(true);
    expect(result.message.channel).toBe("MMS");
    expect(result.message.contentType).toBe("TEXT_AND_IMAGE");
    expect(result.message.providerMessageId).toBe("mTEST1");
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].imageDataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(
      Buffer.byteLength(provider.sent[0].imageDataUrl!) +
        Buffer.byteLength(provider.sent[0].text),
    ).toBeLessThan(320 * 1024);
    const [asset] = await db.select().from(schema.mediaAssets);
    expect(asset.dataBase64).toBeTruthy();
    expect(asset.storageUrl).toBe(`/api/media/${asset.id}`);
    expect(asset.messageId).toBe(result.message.id);
  });

  it("stores provider failures without losing the outbound MMS", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    provider.failNext = true;
    const result = await sendMediaMessage({
      to: contact.phoneNumber!,
      text: "",
      image: sampleImage,
      sender: "USER",
      contactId: contact.id,
    });
    expect(result.ok).toBe(false);
    expect(result.message.status).toBe("FAILED");
    expect(await db.select().from(schema.mediaAssets)).toHaveLength(1);
  });
});
