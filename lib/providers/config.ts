import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { providerSettings, systemSecrets } from "@/lib/db/schema";
import { cleanErrorMessage } from "@/lib/errors";

export interface ElksCredentials {
  username: string;
  password: string;
  fromNumber: string;
}

export interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: string;
  voicemailText: string;
  screeningText: string;
  voicemailAudioId?: string;
  screeningAudioId?: string;
}

type ProviderName = "46elks" | "elevenlabs";

async function encryptionKey(): Promise<Buffer> {
  const configured = process.env.AUTH_SECRET;
  if (configured && configured.length >= 16) {
    return createHash("sha256")
      .update(`personal-phone:providers:${configured}`)
      .digest();
  }
  // Private previews are already protected by Vercel Authentication. Generate
  // durable bootstrap key material in Postgres so Settings works immediately.
  const db = await getDb();
  await db
    .insert(systemSecrets)
    .values({
      key: "provider-encryption-v1",
      value: randomBytes(32).toString("base64url"),
    })
    .onConflictDoNothing();
  const [stored] = await db
    .select()
    .from(systemSecrets)
    .where(eq(systemSecrets.key, "provider-encryption-v1"));
  if (!stored) throw new Error("Could not initialize provider encryption");
  return Buffer.from(stored.value, "base64url");
}

export async function encryptProviderSecrets(
  provider: ProviderName,
  secrets: Record<string, string>,
): Promise<string> {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", await encryptionKey(), iv);
  cipher.setAAD(Buffer.from(provider));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(secrets), "utf8"),
    cipher.final(),
  ]);
  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    encrypted.toString("base64url"),
  ].join(".");
}

export async function decryptProviderSecrets(
  provider: ProviderName,
  payload: string,
): Promise<Record<string, string>> {
  const [version, ivRaw, tagRaw, encryptedRaw] = payload.split(".");
  if (version !== "v1" || !ivRaw || !tagRaw || !encryptedRaw) {
    throw new Error("Invalid encrypted provider configuration");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    await encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAAD(Buffer.from(provider));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
  return JSON.parse(clear) as Record<string, string>;
}

async function readProvider(provider: ProviderName) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(providerSettings)
    .where(eq(providerSettings.provider, provider));
  return row ?? null;
}

export async function saveProviderConfig(
  provider: ProviderName,
  newSecrets: Record<string, string>,
  publicConfig: Record<string, unknown>,
): Promise<void> {
  const db = await getDb();
  const current = await readProvider(provider);
  let oldSecrets: Record<string, string> = {};
  if (current) {
    try {
      oldSecrets = await decryptProviderSecrets(
        provider,
        current.encryptedSecrets,
      );
    } catch {
      // AUTH_SECRET rotation: allow a full credential re-entry to replace
      // undecryptable ciphertext instead of permanently locking the UI.
      oldSecrets = {};
    }
  }
  const merged = { ...oldSecrets };
  for (const [key, value] of Object.entries(newSecrets)) {
    if (value.trim()) merged[key] = value.trim();
  }
  const encrypted = await encryptProviderSecrets(provider, merged);
  await db
    .insert(providerSettings)
    .values({
      provider,
      encryptedSecrets: encrypted,
      publicConfig,
    })
    .onConflictDoUpdate({
      target: providerSettings.provider,
      set: {
        encryptedSecrets: encrypted,
        publicConfig,
        updatedAt: sql`now()`,
        lastTestStatus: null,
        lastTestError: null,
      },
    });
}

export async function getElksCredentials(): Promise<ElksCredentials> {
  const row = await readProvider("46elks");
  const secrets = row
    ? await decryptProviderSecrets("46elks", row.encryptedSecrets)
    : {};
  const username = secrets.username || process.env.ELKS46_USERNAME;
  const password = secrets.password || process.env.ELKS46_PASSWORD;
  const fromNumber =
    String(row?.publicConfig?.fromNumber ?? "") ||
    process.env.ELKS46_FROM_NUMBER;
  if (!username || !password || !fromNumber) {
    throw new Error("46elks is not configured");
  }
  return { username, password, fromNumber };
}

export async function getElevenLabsConfig(): Promise<ElevenLabsConfig> {
  const row = await readProvider("elevenlabs");
  const secrets = row
    ? await decryptProviderSecrets("elevenlabs", row.encryptedSecrets)
    : {};
  const apiKey = secrets.apiKey || process.env.ELEVENLABS_API_KEY;
  const config = row?.publicConfig ?? {};
  const voiceId =
    String(config.voiceId ?? "") || process.env.ELEVENLABS_VOICE_ID;
  if (!apiKey || !voiceId) throw new Error("ElevenLabs is not configured");
  return {
    apiKey,
    voiceId,
    modelId:
      String(config.modelId ?? "") ||
      process.env.ELEVENLABS_MODEL_ID ||
      "eleven_multilingual_v2",
    voicemailText:
      String(config.voicemailText ?? "") ||
      "Hej! Jag kan inte svara just nu. Lämna gärna ett meddelande efter tonen.",
    screeningText:
      String(config.screeningText ?? "") ||
      "Hej! Du har kommit till min telefonassistent. Berätta gärna kort vad ärendet gäller.",
    voicemailAudioId: config.voicemailAudioId
      ? String(config.voicemailAudioId)
      : undefined,
    screeningAudioId: config.screeningAudioId
      ? String(config.screeningAudioId)
      : undefined,
  };
}

export async function updateProviderTestStatus(
  provider: ProviderName,
  ok: boolean,
  error?: unknown,
): Promise<void> {
  const db = await getDb();
  await db
    .update(providerSettings)
    .set({
      lastTestAt: new Date(),
      lastTestStatus: ok ? "OK" : "FAILED",
      lastTestError: ok ? null : cleanErrorMessage(error),
      updatedAt: sql`now()`,
    })
    .where(eq(providerSettings.provider, provider));
}

export async function getProviderStatus() {
  const db = await getDb();
  const rows = await db.select().from(providerSettings);
  return Object.fromEntries(
    rows.map((row) => [
      row.provider,
      {
        configured: true,
        publicConfig: row.publicConfig ?? {},
        updatedAt: row.updatedAt,
        lastTestAt: row.lastTestAt,
        lastTestStatus: row.lastTestStatus,
        lastTestError: row.lastTestError
          ? cleanErrorMessage(row.lastTestError)
          : null,
      },
    ]),
  ) as Record<
    ProviderName,
    {
      configured: boolean;
      publicConfig: Record<string, unknown>;
      updatedAt: Date;
      lastTestAt: Date | null;
      lastTestStatus: string | null;
      lastTestError: string | null;
    }
  >;
}

