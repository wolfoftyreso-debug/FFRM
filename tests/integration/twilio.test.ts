import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { NextRequest } from "next/server";
import sharp from "sharp";
import {
  createTestDb,
  installMockAi,
  seedContact,
  seedOwner,
  uninstallMocks,
} from "./helpers";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { saveProviderConfig } from "@/lib/providers/config";
import { setActiveMessagingProvider } from "@/lib/providers/selection";
import { sendMessage } from "@/lib/sms/send-message";
import { sendMediaMessage } from "@/lib/mms/send-message";
import { POST as inboundTwilio } from "@/app/api/webhooks/twilio/messaging/route";

const ACCOUNT_SID = `AC${"1".repeat(32)}`;
const API_KEY_SID = `SK${"2".repeat(32)}`;
const AUTH_TOKEN = "twilio-auth-token";
const FROM = "+46701112233";

let db: Db;
let originalFetch: typeof fetch;
let requests: { url: string; body: URLSearchParams }[];

describe("Twilio messaging adapter", () => {
  beforeEach(async () => {
    db = await createTestDb();
    originalFetch = globalThis.fetch;
    requests = [];
    process.env.APP_URL = "https://phone.example";
    process.env.WEBHOOK_TOKEN = "webhook-test";
    await saveProviderConfig(
      "twilio",
      {
        apiKeySid: API_KEY_SID,
        apiKeySecret: "api-secret",
        authToken: AUTH_TOKEN,
      },
      { accountSid: ACCOUNT_SID, fromNumber: FROM },
    );
    await setActiveMessagingProvider("twilio");
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      requests.push({
        url,
        body: new URLSearchParams(String(init?.body ?? "")),
      });
      return Response.json({
        sid: `SM${"3".repeat(32)}`,
        status: "queued",
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.APP_URL;
    delete process.env.WEBHOOK_TOKEN;
    uninstallMocks();
  });

  it("sends SMS through Twilio and records provider identity", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const result = await sendMessage({
      to: contact.phoneNumber!,
      text: "Hej från Twilio",
      sender: "USER",
      contactId: contact.id,
    });
    expect(result.ok).toBe(true);
    expect(requests[0].url).toContain(`/Accounts/${ACCOUNT_SID}/Messages.json`);
    expect(requests[0].body.get("From")).toBe(FROM);
    expect(requests[0].body.get("To")).toBe(contact.phoneNumber);
    expect(requests[0].body.get("StatusCallback")).toBe(
      "https://phone.example/api/webhooks/twilio/status",
    );
    const [message] = await db.select().from(schema.messages);
    expect(message.provider).toBe("twilio");
  });

  it("sends MMS with a token-protected public MediaUrl", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const image = new Uint8Array(
      await sharp({
        create: {
          width: 10,
          height: 10,
          channels: 3,
          background: { r: 0, g: 80, b: 255 },
        },
      })
        .png()
        .toBuffer(),
    );
    await sendMediaMessage({
      to: contact.phoneNumber!,
      text: "Bild",
      image,
      sender: "USER",
      contactId: contact.id,
    });
    expect(requests[0].body.get("MediaUrl")).toMatch(
      /^https:\/\/phone\.example\/api\/public\/media\/.+\?token=webhook-test$/,
    );
  });

  it("validates and deduplicates Twilio inbound webhooks", async () => {
    const owner = await seedOwner(db);
    await seedContact(db, owner.id);
    installMockAi({});
    const url = "http://localhost/api/webhooks/twilio/messaging";
    const params = new URLSearchParams({
      MessageSid: `SM${"4".repeat(32)}`,
      AccountSid: ACCOUNT_SID,
      From: "+46700000001",
      To: FROM,
      Body: "Hej!",
      NumMedia: "0",
    });
    const signature = sign(url, params);
    const request = () =>
      new NextRequest(url, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "x-twilio-signature": signature,
        },
        body: params.toString(),
      });
    expect((await inboundTwilio(request())).status).toBe(200);
    expect((await inboundTwilio(request())).status).toBe(200);
    const stored = await db.select().from(schema.messages);
    expect(stored.filter((message) => message.direction === "INBOUND")).toHaveLength(
      1,
    );
    expect(stored.find((message) => message.direction === "INBOUND")?.provider).toBe(
      "twilio",
    );

    const invalid = new NextRequest(url, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "x-twilio-signature": "invalid",
      },
      body: params.toString(),
    });
    expect((await inboundTwilio(invalid)).status).toBe(401);
  });
});

function sign(url: string, params: URLSearchParams): string {
  let payload = url;
  for (const key of [...new Set(params.keys())].sort()) {
    for (const value of params.getAll(key).sort()) payload += `${key}${value}`;
  }
  return createHmac("sha1", AUTH_TOKEN).update(payload).digest("base64");
}
