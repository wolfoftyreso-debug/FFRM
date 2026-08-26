import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
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
import { eq } from "drizzle-orm";
import { setAiForTests } from "@/lib/ai/client";
import { POST as voiceWebhook } from "@/app/api/webhooks/46elks/voice/route";
import { POST as afterConnectWebhook } from "@/app/api/webhooks/46elks/voice/after-connect/route";
import { POST as recordingWebhook } from "@/app/api/webhooks/46elks/recording/route";
import { POST as hangupWebhook } from "@/app/api/webhooks/46elks/hangup/route";
import { processCallRecording } from "@/lib/voice/process-recording";

function formRequest(path: string, body: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

async function setOwnerPhone(db: Db, ownerId: string) {
  await db
    .update(schema.users)
    .set({
      phoneNumber: "+46700000099",
      // Equal start/end disables the night window so routing tests stay stable.
      callPolicy: {
        knownContacts: "RING_THROUGH",
        unknownCallers: "SCREEN",
        nightStart: "00:00",
        nightEnd: "00:00",
        nightAction: "VOICEMAIL",
        nightPriorityThreshold: 85,
      },
    })
    .where(eq(schema.users.id, ownerId));
}

/** AI mock covering transcription + voicemail analysis. */
function installVoiceAi() {
  setAiForTests(
    async <T,>(args: { purpose: string; model: string; schema: { parse: (v: unknown) => T } }) => ({
      output: args.schema.parse({
        summary: "Anna vill flytta torsdagens möte.",
        topic: "scheduling",
        requiresUser: true,
        urgency: "MEDIUM",
      }),
      usage: { model: args.model, inputTokens: 50, outputTokens: 20, durationMs: 3 },
    }),
    null,
    {
      transcribe: async () => ({
        text: "Hej, det är Anna. Jag ville flytta torsdagens möte.",
        durationMs: 5,
      }),
    },
  );
}

let db: Db;
let provider: MockMessagingProvider;

describe("voice pipeline", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
    installVoiceAi();
    // Intercept the recording fetch from 46elks.
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("46elks") || url.endsWith(".wav")) {
        return new Response(new Uint8Array([82, 73, 70, 70]), { status: 200 });
      }
      throw new Error(`Unexpected fetch in test: ${url}`);
    }) as typeof fetch;
  });
  afterEach(() => uninstallMocks());

  it("rings through for known contacts and stores the call", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    const contact = await seedContact(db, owner.id);

    const res = await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", {
        callid: "cCALL1",
        from: "+46700000001",
        to: "+46766861234",
        direction: "incoming",
      }),
    );
    expect(res.status).toBe(200);
    const action = await res.json();
    expect(action.connect).toBe("+46700000099");
    expect(action.next).toContain("/api/webhooks/46elks/voice/after-connect");

    const [call] = await db.select().from(schema.calls);
    expect(call.contactId).toBe(contact.id);
    expect(call.conversationId).toBeTruthy();
    expect(call.disposition).toBe("RING_THROUGH");
    expect(call.state).toBe("RINGING");
    const events = (await db.select().from(schema.messages)).filter(
      (m) => m.channel === "VOICE_CALL",
    );
    expect(events).toHaveLength(1);
    expect(events[0].conversationId).toBe(call.conversationId);
    expect(events[0].text).toContain("Incoming call");
  });

  it("is idempotent for retried voice_start webhooks", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    const contact = await seedContact(db, owner.id);
    const body = {
      callid: "cRETRY1",
      from: "+46700000001",
      to: "+46766861234",
    };
    const first = await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", body),
    );
    const firstAction = await first.json();
    await db
      .update(schema.contacts)
      .set({ callPolicy: "BLOCK" })
      .where(eq(schema.contacts.id, contact.id));
    const retry = await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", body),
    );
    expect(await retry.json()).toEqual(firstAction);
    const calls = await db.select().from(schema.calls);
    expect(calls).toHaveLength(1);
  });

  it("screens unknown callers", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    const res = await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", {
        callid: "cUNKNOWN1",
        from: "+46709999999",
        to: "+46766861234",
      }),
    );
    const action = await res.json();
    // No greeting configured in tests → straight to record.
    expect(action.record).toContain("/api/webhooks/46elks/recording");
    const [call] = await db.select().from(schema.calls);
    expect(call.disposition).toBe("SCREEN");
  });

  it("rejects blocked numbers", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    await db
      .insert(schema.blockedNumbers)
      .values({ phoneNumber: "+46708888888" });
    const res = await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", {
        callid: "cBLOCKED1",
        from: "+46708888888",
        to: "+46766861234",
      }),
    );
    const action = await res.json();
    expect(action.hangup).toBe("reject");
  });

  it("falls back to voicemail when the owner does not answer", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    await seedContact(db, owner.id);
    await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", {
        callid: "cNOANSWER1",
        from: "+46700000001",
        to: "+46766861234",
      }),
    );
    const res = await afterConnectWebhook(
      formRequest("/api/webhooks/46elks/voice/after-connect", {
        callid: "cNOANSWER1",
        result: "failed",
      }),
    );
    const action = await res.json();
    expect(action.record).toContain("/api/webhooks/46elks/recording");
    const [call] = await db.select().from(schema.calls);
    expect(call.state).toBe("VOICEMAIL");
  });

  it("processes a voicemail: transcript, AI summary, owner notification", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    const contact = await seedContact(db, owner.id, {
      firstName: "Anna",
      lastName: "Andersson",
      phoneNumber: "+46700000002",
    });
    await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", {
        callid: "cVM1",
        from: "+46700000002",
        to: "+46766861234",
      }),
    );
    await afterConnectWebhook(
      formRequest("/api/webhooks/46elks/voice/after-connect", {
        callid: "cVM1",
        result: "failed",
      }),
    );
    const res = await recordingWebhook(
      formRequest("/api/webhooks/46elks/recording", {
        callid: "cVM1",
        wav: "https://api.46elks.com/a1/recordings/rec1.wav",
        duration: "42",
      }),
    );
    expect(res.status).toBe(200);

    // waitUntil runs unawaited; process deterministically (claim is idempotent).
    const [pending] = await db.select().from(schema.calls);
    await processCallRecording(pending.id);
    // Give any waitUntil-triggered duplicate a tick to prove idempotency.
    await new Promise((r) => setTimeout(r, 50));

    const [call] = await db.select().from(schema.calls);
    expect(call.contactId).toBe(contact.id);
    expect(call.transcript).toContain("Anna");
    expect(call.aiSummary).toContain("torsdagens möte");
    expect(call.aiRequiresUser).toBe(true);
    const voicemailEvents = (await db.select().from(schema.messages)).filter(
      (m) => m.channel === "VOICEMAIL",
    );
    expect(voicemailEvents.some((m) => m.text.includes("torsdagens möte"))).toBe(
      true,
    );

    const ownerSms = provider.sent.filter((s) => s.to === "+46700000099");
    expect(ownerSms).toHaveLength(1);
    expect(ownerSms[0].text).toContain("Röstmeddelande från Anna");
  });

  it("marks unanswered ring-through calls as missed and notifies the owner", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    await seedContact(db, owner.id);
    await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", {
        callid: "cMISS1",
        from: "+46700000001",
        to: "+46766861234",
      }),
    );
    // Caller hangs up while ringing — whenhangup fires with no recording.
    const res = await hangupWebhook(
      formRequest("/api/webhooks/46elks/hangup", {
        id: "cMISS1",
        state: "failed",
        duration: "0",
      }),
    );
    expect(res.status).toBe(200);
    const [call] = await db.select().from(schema.calls);
    expect(call.state).toBe("MISSED");
    const ownerSms = provider.sent.filter((s) => s.to === "+46700000099");
    expect(ownerSms).toHaveLength(1);
    expect(ownerSms[0].text).toContain("Missat samtal från Johan");
    await hangupWebhook(
      formRequest("/api/webhooks/46elks/hangup", {
        id: "cMISS1",
        state: "failed",
        duration: "0",
      }),
    );
    expect(provider.sent.filter((s) => s.to === "+46700000099")).toHaveLength(1);
  });

  it("marks answered calls as completed with duration", async () => {
    const owner = await seedOwner(db);
    await setOwnerPhone(db, owner.id);
    await seedContact(db, owner.id);
    await voiceWebhook(
      formRequest("/api/webhooks/46elks/voice", {
        callid: "cOK1",
        from: "+46700000001",
        to: "+46766861234",
      }),
    );
    const connectRes = await afterConnectWebhook(
      formRequest("/api/webhooks/46elks/voice/after-connect", {
        callid: "cOK1",
        result: "success",
      }),
    );
    expect((await connectRes.json()).hangup).toBe("");
    await hangupWebhook(
      formRequest("/api/webhooks/46elks/hangup", {
        id: "cOK1",
        state: "success",
        duration: "722",
      }),
    );
    const [call] = await db.select().from(schema.calls);
    expect(call.state).toBe("COMPLETED");
    expect(call.durationSeconds).toBe(722);
    // No missed-call notification.
    expect(provider.sent).toHaveLength(0);
  });
});
