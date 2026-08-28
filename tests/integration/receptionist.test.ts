import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  installMockProvider,
  seedOwner,
  uninstallMocks,
  type MockMessagingProvider,
} from "./helpers";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { setAiForTests } from "@/lib/ai/client";
import { POST as voiceWebhook } from "@/app/api/webhooks/46elks/voice/route";
import {
  connectScreenedCall,
  decideGateAction,
  processCallbackNotifications,
  processGateRecording,
} from "@/lib/voice/receptionist";

process.env.ELEVENLABS_API_KEY = "xi_test";
process.env.ELEVENLABS_VOICE_ID = "voice_test";

let db: Db;
let provider: MockMessagingProvider;
let originalFetch: typeof fetch;

function formRequest(body: Record<string, string>) {
  return new NextRequest("http://localhost/api/webhooks/46elks/voice", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
}

describe("AI receptionist gate", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
    originalFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(new Uint8Array([82, 73, 70, 70, 1, 2, 3]), {
        status: 200,
        headers: { "content-type": "audio/wav" },
      })) as typeof fetch;
    setAiForTests(
      async <T,>(args: {
        model: string;
        schema: { parse: (value: unknown) => T };
      }) => ({
        output: args.schema.parse({
          callerName: "Anna Andersson",
          purpose: "Hon behöver flytta morgondagens leverans.",
          summary: "Anna vill flytta morgondagens leverans.",
          urgency: "MEDIUM",
          hasName: true,
          hasPurpose: true,
          openQuestion: "Mm, jag förstår. Vilken tid passar leveransen bäst?",
        }),
        usage: {
          model: args.model,
          inputTokens: 50,
          outputTokens: 20,
          durationMs: 3,
        },
      }),
      null,
      {
        transcribe: async () => ({
          text: "Hej, Anna Andersson. Jag behöver flytta morgondagens leverans.",
          durationMs: 4,
        }),
      },
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    uninstallMocks();
  });

  it("requires name and purpose, asks an open question, then connects", async () => {
    await enableReceptionist("AJOUR");
    const response = await voiceWebhook(
      formRequest({
        callid: "cGATE1",
        from: "+46705550101",
        to: "+46766861234",
      }),
    );
    const start = (await response.json()) as Record<string, unknown>;
    expect(start.play).toContain("/api/public/audio/");
    expect(start.next).toMatchObject({ record: expect.stringContaining("stage=gate") });

    await processGateRecording({
      providerCallId: "cGATE1",
      attempt: 1,
      recordingUrl: "https://api.46elks.test/recording1.wav",
    });
    const followup = (await decideGateAction("cGATE1", 1)) as Record<
      string,
      unknown
    >;
    expect(followup.play).toContain("/api/public/audio/");
    expect(followup.next).toMatchObject({
      record: expect.stringContaining("attempt=2"),
    });

    await processGateRecording({
      providerCallId: "cGATE1",
      attempt: 2,
      recordingUrl: "https://api.46elks.test/recording2.wav",
    });
    const decision = (await decideGateAction("cGATE1", 2)) as Record<
      string,
      unknown
    >;
    expect(decision.next).toContain("/voice/gate/connect");
    const connect = await connectScreenedCall("cGATE1");
    expect(connect.connect).toBe("+46700000099");

    const [call] = await db.select().from(schema.calls);
    expect(call.callerName).toBe("Anna Andersson");
    expect(call.callerPurpose).toContain("leverans");
    expect(call.screeningDecision).toBe("CONNECT");
    const storedContacts = await db.select().from(schema.contacts);
    expect(storedContacts).toHaveLength(1);
    expect(storedContacts[0].phoneNumber).toBe("+46705550101");
    const turns = await db.select().from(schema.callScreeningTurns);
    expect(turns).toHaveLength(2);
  });

  it("creates one callback ticket and repeats notices every 15 minutes", async () => {
    await enableReceptionist("NOT_AJOUR");
    await voiceWebhook(
      formRequest({
        callid: "cGATE2",
        from: "+46705550102",
        to: "+46766861234",
      }),
    );
    const [call] = await db
      .update(schema.calls)
      .set({
        callerName: "Bo Berg",
        callerPurpose: "Vill boka om ett möte.",
        screeningSummary: "Bo vill boka om ett möte.",
        screeningUrgency: "MEDIUM",
        screeningAttemptCount: 2,
      })
      .where(eq(schema.calls.providerCallId, "cGATE2"))
      .returning();

    const action = await decideGateAction("cGATE2", 2);
    expect(action.play).toContain("/api/public/audio/");
    expect(provider.sent).toHaveLength(1);
    const [ticket] = await db.select().from(schema.reminders);
    expect(ticket.kind).toBe("TASK");
    expect(ticket.repeatEveryMinutes).toBe(15);
    expect(ticket.description).toContain("Vill boka om");

    await db
      .update(schema.reminders)
      .set({ dueAt: new Date(0) })
      .where(eq(schema.reminders.id, ticket.id));
    expect(await processCallbackNotifications(new Date())).toBe(1);
    expect(provider.sent).toHaveLength(2);
    await db
      .update(schema.reminders)
      .set({ status: "DONE", dueAt: new Date(0) })
      .where(eq(schema.reminders.id, ticket.id));
    expect(await processCallbackNotifications(new Date())).toBe(0);
    const [updatedCall] = await db
      .select()
      .from(schema.calls)
      .where(eq(schema.calls.id, call.id));
    expect(updatedCall.callbackTicketId).toBe(ticket.id);
  });
});

async function enableReceptionist(
  availabilityMode: "AJOUR" | "NOT_AJOUR",
): Promise<void> {
  const owner = await seedOwner(db);
  const purposes = [
    "RECEPTIONIST_GREETING",
    "RECEPTIONIST_RETRY",
    "RECEPTIONIST_CONNECT",
    "RECEPTIONIST_CALLBACK",
  ];
  const assets = [];
  for (const purpose of purposes) {
    const [asset] = await db
      .insert(schema.audioAssets)
      .values({
        provider: "elevenlabs",
        purpose,
        mimeType: "audio/mpeg",
        dataBase64: "AA==",
        byteSize: 1,
        sourceText: purpose,
      })
      .returning();
    assets.push(asset);
  }
  await db
    .update(schema.users)
    .set({
      phoneNumber: "+46700000099",
      lastActiveAt: new Date(),
      receptionistConfig: {
        enabled: true,
        availabilityMode,
        greetingAudioId: assets[0].id,
        retryAudioId: assets[1].id,
        connectAudioId: assets[2].id,
        callbackAudioId: assets[3].id,
      },
    })
    .where(eq(schema.users.id, owner.id));
}
