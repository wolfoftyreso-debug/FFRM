import { beforeEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  seedOwner,
} from "./helpers";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import {
  decryptProviderSecrets,
  encryptProviderSecrets,
  getElksCredentials,
  getElevenLabsConfig,
  getProviderStatus,
  saveProviderConfig,
  updateProviderTestStatus,
} from "@/lib/providers/config";
import {
  generateElevenLabsSpeech,
  listElevenLabsVoices,
} from "@/lib/providers/elevenlabs";
import { testElksConnection } from "@/lib/providers/elks46";
import { GET as publicAudio } from "@/app/api/public/audio/[id]/route";
import { POST as cloneVoiceEndpoint } from "@/app/api/providers/elevenlabs/clone-voice/route";

let db: Db;

describe("encrypted provider configuration", () => {
  beforeEach(async () => {
    db = await createTestDb();
    await seedOwner(db);
  });

  it("AES-GCM round-trips secrets and binds ciphertext to provider", async () => {
    const encrypted = await encryptProviderSecrets("46elks", {
      username: "u_secret",
      password: "p_secret",
    });
    expect(encrypted).not.toContain("u_secret");
    expect(await decryptProviderSecrets("46elks", encrypted)).toEqual({
      username: "u_secret",
      password: "p_secret",
    });
    await expect(
      decryptProviderSecrets("elevenlabs", encrypted),
    ).rejects.toThrow();
  });

  it("stores no plaintext 46elks credentials and resolver prefers saved values", async () => {
    await saveProviderConfig(
      "46elks",
      { username: "u_saved", password: "p_saved" },
      { fromNumber: "+46701112233" },
    );
    const [row] = await db.select().from(schema.providerSettings);
    expect(row.encryptedSecrets).not.toContain("u_saved");
    expect(row.encryptedSecrets).not.toContain("p_saved");
    expect(await getElksCredentials()).toEqual({
      username: "u_saved",
      password: "p_saved",
      fromNumber: "+46701112233",
    });
  });

  it("keeps existing secret when a settings form submits a blank password", async () => {
    await saveProviderConfig(
      "46elks",
      { username: "first", password: "keep-me" },
      { fromNumber: "+46701112233" },
    );
    await saveProviderConfig(
      "46elks",
      { username: "", password: "" },
      { fromNumber: "+46709998877" },
    );
    expect(await getElksCredentials()).toEqual({
      username: "first",
      password: "keep-me",
      fromNumber: "+46709998877",
    });
  });

  it("tests 46elks and records a safe connection status", async () => {
    await saveProviderConfig(
      "46elks",
      { username: "u", password: "p" },
      { fromNumber: "+46701112233" },
    );
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: "me" }), { status: 200 })) as typeof fetch;
    await testElksConnection();
    await updateProviderTestStatus("46elks", true);
    expect((await getProviderStatus())["46elks"]?.lastTestStatus).toBe("OK");
  });

  it("resolves ElevenLabs, lists voices and generates bounded speech", async () => {
    await saveProviderConfig(
      "elevenlabs",
      { apiKey: "xi-secret" },
      {
        voiceId: "voice-1",
        modelId: "eleven_multilingual_v2",
        voicemailText: "Lämna ett meddelande",
        screeningText: "Vad gäller ärendet?",
      },
    );
    expect((await getElevenLabsConfig()).apiKey).toBe("xi-secret");
    const audio = new Uint8Array([73, 68, 51, 1, 2, 3]);
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/v2/voices")) {
        return new Response(
          JSON.stringify({
            voices: [{ voice_id: "voice-1", name: "Swedish Voice" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(audio.buffer, {
        status: 200,
        headers: { "content-type": "audio/mpeg" },
      });
    }) as typeof fetch;
    expect(await listElevenLabsVoices()).toEqual([
      { voiceId: "voice-1", name: "Swedish Voice" },
    ]);
    const generated = await generateElevenLabsSpeech("Hej!");
    expect(generated.data).toEqual(audio);
    expect(generated.mimeType).toBe("audio/mpeg");
  });

  it("serves generated greeting audio only with the webhook token", async () => {
    const bytes = Buffer.from("ID3-audio");
    const [asset] = await db
      .insert(schema.audioAssets)
      .values({
        provider: "elevenlabs",
        purpose: "VOICEMAIL_GREETING",
        mimeType: "audio/mpeg",
        dataBase64: bytes.toString("base64"),
        byteSize: bytes.length,
      })
      .returning();
    process.env.WEBHOOK_TOKEN = "test-token";
    const denied = await publicAudio(
      new Request(`http://localhost/api/public/audio/${asset.id}`),
      { params: Promise.resolve({ id: asset.id }) },
    );
    expect(denied.status).toBe(401);
    const allowed = await publicAudio(
      new Request(
        `http://localhost/api/public/audio/${asset.id}?token=test-token`,
      ),
      { params: Promise.resolve({ id: asset.id }) },
    );
    expect(allowed.status).toBe(200);
    expect(Buffer.from(await allowed.arrayBuffer())).toEqual(bytes);
  });

  it("creates and selects Min röst only with explicit own-voice consent", async () => {
    await saveProviderConfig(
      "elevenlabs",
      { apiKey: "xi-secret" },
      {
        voiceId: "old-voice",
        modelId: "eleven_multilingual_v2",
      },
    );
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      const form = init!.body as FormData;
      expect(form.get("name")).toBe("Min röst");
      expect(form.get("files")).toBeInstanceOf(File);
      return new Response(JSON.stringify({ voice_id: "my-cloned-voice" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    const form = new FormData();
    form.set(
      "audio",
      new File([new ArrayBuffer(60_000)], "min-rost.webm", {
        type: "audio/webm",
      }),
    );
    form.set("consent", "own-voice-confirmed");
    const response = await cloneVoiceEndpoint(
      new Request("http://localhost/api/providers/elevenlabs/clone-voice", {
        method: "POST",
        body: form,
      }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).voiceName).toBe("Min röst");
    const config = await getElevenLabsConfig();
    expect(config.voiceId).toBe("my-cloned-voice");
    expect(
      (await getProviderStatus()).elevenlabs?.publicConfig.voiceName,
    ).toBe("Min röst");

    const noConsent = new FormData();
    noConsent.set(
      "audio",
      new File([new ArrayBuffer(60_000)], "other.webm", {
        type: "audio/webm",
      }),
    );
    const denied = await cloneVoiceEndpoint(
      new Request("http://localhost/api/providers/elevenlabs/clone-voice", {
        method: "POST",
        body: noConsent,
      }),
    );
    expect(denied.status).toBe(400);
  });
});
