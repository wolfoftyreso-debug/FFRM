import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  createTestDb,
  installMockAi,
  installMockProvider,
  lowRiskAutoReply,
  seedContact,
  seedOwner,
  uninstallMocks,
} from "./helpers";
import { POST as captionEndpoint } from "@/app/api/compose/image-caption/route";
import { POST as smsEndpoint } from "@/app/api/webhooks/46elks/sms/route";
import { GET as recordingEndpoint } from "@/app/api/calls/[id]/recording/route";
import { POST as readEndpoint } from "@/app/api/conversations/[id]/read/route";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { listConversations } from "@/lib/queries";

let db: Db;

describe("authenticated and event API endpoints", () => {
  beforeEach(async () => {
    db = await createTestDb();
    installMockProvider();
    installMockAi({ triage: lowRiskAutoReply, imageCaption: "Vilken pärla 😂" });
  });
  afterEach(() => uninstallMocks());

  it("returns a contact-adapted image caption from the composer endpoint", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const image = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 200, g: 10, b: 10 },
      },
    })
      .jpeg()
      .toBuffer();
    const form = new FormData();
    form.set("contactId", contact.id);
    form.set(
      "image",
      new File([new Uint8Array(image)], "photo.jpg", { type: "image/jpeg" }),
    );
    const response = await captionEndpoint(
      new Request("http://localhost/api/compose/image-caption", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).message).toBe("Vilken pärla 😂");
  });

  it("fires INCOMING_SMS automations exactly once across webhook retries", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    await db.insert(schema.automations).values({
      name: "Log incoming",
      triggerType: "INCOMING_SMS",
      triggerConfig: {},
      actionType: "LOG_EVENT",
      actionConfig: { title: "Inbound observed" },
      contactId: contact.id,
      autonomyLevel: 1,
    });
    const body = new URLSearchParams({
      id: "sEVENT1",
      from: contact.phoneNumber!,
      to: "+46766861234",
      message: "Tack!",
    });
    const request = () =>
      new NextRequest("http://localhost/api/webhooks/46elks/sms", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
    expect((await smsEndpoint(request())).status).toBe(200);
    expect((await smsEndpoint(request())).status).toBe(200);
    for (let i = 0; i < 100; i++) {
      if ((await db.select().from(schema.automationExecutions)).length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const executions = await db.select().from(schema.automationExecutions);
    expect(executions).toHaveLength(1);
    expect(executions[0].occurrenceKey).toBe("incoming-sms:sEVENT1");
    expect(executions[0].status).toBe("COMPLETED");
  });

  it("proxies trusted voicemail audio without exposing provider credentials", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const audio = new Uint8Array([82, 73, 70, 70, 1, 2, 3]);
    globalThis.fetch = (async () =>
      new Response(audio.buffer, {
        status: 200,
        headers: { "content-type": "audio/wav" },
      })) as typeof fetch;
    const [call] = await db
      .insert(schema.calls)
      .values({
        providerCallId: "cAUDIO",
        contactId: contact.id,
        direction: "INBOUND",
        fromNumber: contact.phoneNumber!,
        toNumber: "+46766861234",
        state: "VOICEMAIL",
        recordingUrl: "https://api.46elks.com/a1/recordings/test.wav",
      })
      .returning();
    const response = await recordingEndpoint(new Request("http://localhost"), {
      params: Promise.resolve({ id: call.id }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("audio/wav");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(audio);
    const [stored] = await db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.id, call.id));
    expect(stored.recordingUrl).toContain("api.46elks.com");
  });

  it("marks a conversation read and removes its unread inbox state", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    await db
      .update(schema.conversations)
      .set({ lastMessageAt: new Date(), lastReadAt: null })
      .where(eq(schema.conversations.id, conversationId));
    expect((await listConversations())[0].unread).toBe(true);
    const response = await readEndpoint(new Request("http://localhost"), {
      params: Promise.resolve({ id: conversationId }),
    });
    expect(response.status).toBe(200);
    expect((await listConversations())[0].unread).toBe(false);
  });
});
