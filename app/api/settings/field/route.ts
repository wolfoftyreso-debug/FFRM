import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  getProviderStatus,
  saveProviderConfig,
} from "@/lib/providers/config";
import { ensureOwner } from "@/lib/auth/owner";
import { cleanErrorMessage } from "@/lib/errors";
import type { ReceptionistConfig } from "@/lib/db/schema";

const inputSchema = z.object({
  section: z.enum([
    "owner",
    "callPolicy",
    "receptionist",
    "messaging",
    "46elks",
    "twilio",
    "elevenlabs",
    "apollo",
  ]),
  field: z.string().min(1).max(64),
  value: z.string().max(10_000),
});

const callDisposition = new Set([
  "RING_THROUGH",
  "VOICEMAIL",
  "SCREEN",
  "REJECT",
]);

/** Authenticated same-origin Settings autosave endpoint. */
export async function POST(req: Request) {
  try {
    const input = inputSchema.parse(await req.json());
    await ensureOwner();
    if (input.section === "owner") await saveOwnerField(input.field, input.value);
    else if (input.section === "callPolicy")
      await saveCallPolicyField(input.field, input.value);
    else if (input.section === "receptionist")
      await saveReceptionistField(input.field, input.value);
    else if (input.section === "messaging")
      await saveMessagingField(input.field, input.value);
    else if (input.section === "46elks")
      await saveElksField(input.field, input.value);
    else if (input.section === "twilio")
      await saveTwilioField(input.field, input.value);
    else if (input.section === "elevenlabs")
      await saveElevenField(input.field, input.value);
    else await saveApolloField(input.field, input.value);
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cleanErrorMessage(error, 240) },
      { status: 400 },
    );
  }
}

async function saveMessagingField(field: string, value: string) {
  if (field !== "provider" || !["46elks", "twilio"].includes(value)) {
    throw new Error("Unsupported messaging provider");
  }
  if (value === "twilio") {
    const { getTwilioCredentials } = await import("@/lib/providers/config");
    await getTwilioCredentials();
  }
  const { setActiveMessagingProvider } = await import(
    "@/lib/providers/selection"
  );
  await setActiveMessagingProvider(value as "46elks" | "twilio");
}

async function saveReceptionistField(field: string, value: string) {
  const allowed = new Set([
    "enabled",
    "availabilityMode",
    "workStart",
    "workEnd",
    "activeWindowMinutes",
    "greetingText",
    "retryText",
    "connectText",
    "callbackText",
    "licensedHoldAudioUrl",
  ]);
  if (!allowed.has(field)) throw new Error("Unsupported receptionist field");
  const db = await getDb();
  const current = await owner();
  const config: ReceptionistConfig = { ...(current.receptionistConfig ?? {}) };
  if (field === "enabled") {
    if (!["true", "false"].includes(value)) throw new Error("Invalid setting");
    if (
      value === "true" &&
      (!config.greetingAudioId ||
        !config.retryAudioId ||
        !config.connectAudioId ||
        !config.callbackAudioId)
    ) {
      throw new Error("Generate the receptionist voice prompts first");
    }
    config.enabled = value === "true";
  } else if (field === "availabilityMode") {
    if (!["AUTO", "AJOUR", "NOT_AJOUR"].includes(value)) {
      throw new Error("Invalid availability mode");
    }
    config.availabilityMode = value as ReceptionistConfig["availabilityMode"];
  } else if (field === "activeWindowMinutes") {
    const minutes = Number(value);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 120) {
      throw new Error("Use 1–120 minutes");
    }
    config.activeWindowMinutes = minutes;
  } else if (field === "workStart" || field === "workEnd") {
    if (!/^\d{2}:\d{2}$/.test(value)) throw new Error("Invalid time");
    config[field] = value;
  } else if (field === "licensedHoldAudioUrl") {
    const url = value.trim();
    if (url && !z.string().url().safeParse(url).success) {
      throw new Error("Use a valid URL");
    }
    config.licensedHoldAudioUrl = url || undefined;
  } else {
    const text = value.trim();
    if (!text) throw new Error("Text cannot be empty");
    config[
      field as "greetingText" | "retryText" | "connectText" | "callbackText"
    ] = text;
    const audioField = {
      greetingText: "greetingAudioId",
      retryText: "retryAudioId",
      connectText: "connectAudioId",
      callbackText: "callbackAudioId",
    }[field] as
      | "greetingAudioId"
      | "retryAudioId"
      | "connectAudioId"
      | "callbackAudioId";
    config[audioField] = undefined;
  }
  await db
    .update(users)
    .set({ receptionistConfig: config, updatedAt: sql`now()` })
    .where(eq(users.id, current.id));
}

async function owner() {
  const db = await getDb();
  const [row] = await db.select().from(users).limit(1);
  if (!row) throw new Error("Owner profile is unavailable");
  return row;
}

async function saveOwnerField(field: string, value: string) {
  const allowed = new Set([
    "name",
    "email",
    "phoneNumber",
    "preferredLanguage",
    "timezone",
    "defaultTone",
    "emojiUsage",
    "formality",
    "commonExpressions",
    "dialogueOpenings",
    "dialogueClosings",
  ]);
  if (!allowed.has(field)) throw new Error("Unsupported owner field");
  const db = await getDb();
  const current = await owner();
  if (field === "phoneNumber") {
    const phone = value.trim() ? normalizePhoneNumber(value) : null;
    if (value.trim() && !phone) throw new Error("Use a valid phone number");
    await db
      .update(users)
      .set({ phoneNumber: phone, updatedAt: sql`now()` })
      .where(eq(users.id, current.id));
    return;
  }
  if (field === "email") {
    const email = value.trim();
    if (email && !z.string().email().safeParse(email).success) {
      throw new Error("Use a valid email address");
    }
    await db
      .update(users)
      .set({ email: email || null, updatedAt: sql`now()` })
      .where(eq(users.id, current.id));
    return;
  }
  if (["name", "preferredLanguage", "timezone"].includes(field)) {
    if (!value.trim()) throw new Error("This field cannot be empty");
    await db
      .update(users)
      .set({ [field]: value.trim(), updatedAt: sql`now()` })
      .where(eq(users.id, current.id));
    return;
  }
  const voiceProfile = { ...(current.voiceProfile ?? {}) };
  if (
    field === "commonExpressions" ||
    field === "dialogueOpenings" ||
    field === "dialogueClosings"
  ) {
    const values = value
      .split(field === "commonExpressions" ? "," : /\r?\n/)
      .map((part) => part.trim())
      .filter(Boolean);
    if (field === "commonExpressions") voiceProfile.commonExpressions = values;
    else if (field === "dialogueOpenings")
      voiceProfile.dialogueOpenings = values;
    else voiceProfile.dialogueClosings = values;
  } else {
    voiceProfile[field as "defaultTone" | "emojiUsage" | "formality"] =
      value.trim();
  }
  await db
    .update(users)
    .set({ voiceProfile, updatedAt: sql`now()` })
    .where(eq(users.id, current.id));
}

async function saveCallPolicyField(field: string, value: string) {
  const allowed = new Set([
    "ownerPhone",
    "knownContacts",
    "unknownCallers",
    "nightStart",
    "nightEnd",
    "nightAction",
    "nightPriorityThreshold",
  ]);
  if (!allowed.has(field)) throw new Error("Unsupported call-policy field");
  const db = await getDb();
  const current = await owner();
  if (field === "ownerPhone") {
    const phone = value.trim() ? normalizePhoneNumber(value) : null;
    if (value.trim() && !phone) throw new Error("Use a valid phone number");
    await db
      .update(users)
      .set({ phoneNumber: phone, updatedAt: sql`now()` })
      .where(eq(users.id, current.id));
    return;
  }
  const policy = { ...(current.callPolicy ?? {}) } as Record<string, unknown>;
  if (["knownContacts", "unknownCallers", "nightAction"].includes(field)) {
    if (!callDisposition.has(value)) throw new Error("Invalid call action");
    policy[field] = value;
  } else if (field === "nightPriorityThreshold") {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0 || number > 100) {
      throw new Error("Priority must be between 0 and 100");
    }
    policy[field] = number;
  } else {
    if (!/^\d{2}:\d{2}$/.test(value)) throw new Error("Invalid time");
    policy[field] = value;
  }
  await db
    .update(users)
    .set({ callPolicy: policy, updatedAt: sql`now()` })
    .where(eq(users.id, current.id));
}

async function saveElksField(field: string, value: string) {
  if (!["username", "password", "fromNumber"].includes(field)) {
    throw new Error("Unsupported 46elks field");
  }
  const current =
    (await getProviderStatus())["46elks"]?.publicConfig ?? {};
  const publicConfig = { ...current };
  const secrets: Record<string, string> = {};
  if (field === "fromNumber") {
    const phone = normalizePhoneNumber(value);
    if (!phone) throw new Error("Use a valid E.164 phone number");
    publicConfig.fromNumber = phone;
  } else {
    if (!value.trim()) return; // blank secret keeps current value
    secrets[field] = value;
  }
  await saveProviderConfig("46elks", secrets, publicConfig);
}

async function saveTwilioField(field: string, value: string) {
  const allowed = new Set([
    "accountSid",
    "apiKeySid",
    "apiKeySecret",
    "authToken",
    "fromNumber",
  ]);
  if (!allowed.has(field)) throw new Error("Unsupported Twilio field");
  const current = (await getProviderStatus()).twilio?.publicConfig ?? {};
  const publicConfig = { ...current };
  const secrets: Record<string, string> = {};
  if (field === "accountSid") {
    const sid = value.trim();
    if (!/^AC[a-fA-F0-9]{32}$/.test(sid)) {
      throw new Error("Use a valid Twilio Account SID");
    }
    publicConfig.accountSid = sid;
  } else if (field === "fromNumber") {
    const phone = normalizePhoneNumber(value);
    if (!phone) throw new Error("Use a valid E.164 phone number");
    publicConfig.fromNumber = phone;
  } else {
    if (!value.trim()) return;
    if (field === "apiKeySid" && !/^SK[a-fA-F0-9]{32}$/.test(value.trim())) {
      throw new Error("Use a valid Twilio API Key SID");
    }
    secrets[field] = value.trim();
  }
  await saveProviderConfig("twilio", secrets, publicConfig);
}

async function saveElevenField(field: string, value: string) {
  const allowed = new Set([
    "apiKey",
    "voiceId",
    "modelId",
    "voicemailText",
    "screeningText",
  ]);
  if (!allowed.has(field)) throw new Error("Unsupported ElevenLabs field");
  const current =
    (await getProviderStatus()).elevenlabs?.publicConfig ?? {};
  const publicConfig = { ...current };
  const secrets: Record<string, string> = {};
  if (field === "apiKey") {
    if (!value.trim()) return;
    secrets.apiKey = value;
  } else {
    if (["voiceId", "modelId"].includes(field) && !value.trim()) {
      throw new Error("This field cannot be empty");
    }
    publicConfig[field] = value.trim();
  }
  await saveProviderConfig("elevenlabs", secrets, publicConfig);
}

async function saveApolloField(field: string, value: string) {
  const allowed = new Set([
    "apiKey",
    "masterKey",
    "defaultTitles",
    "defaultSeniorities",
    "defaultIndustries",
    "defaultPersonLocations",
    "defaultOrganizationLocations",
    "defaultKeywords",
    "defaultLimit",
    "revealPhoneNumbers",
    "requirePhone",
    "includeSimilarTitles",
  ]);
  if (!allowed.has(field)) throw new Error("Unsupported Apollo field");
  const current = (await getProviderStatus()).apollo?.publicConfig ?? {};
  const publicConfig = { ...current };
  const secrets: Record<string, string> = {};
  if (field === "apiKey" || field === "masterKey") {
    if (!value.trim()) return;
    secrets.apiKey = value.trim();
    publicConfig.hasApiKey = true;
  } else if (field === "defaultLimit") {
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new Error("Use 1–100 people per fetch");
    }
    publicConfig.defaultLimit = limit;
  } else if (
    field === "revealPhoneNumbers" ||
    field === "requirePhone" ||
    field === "includeSimilarTitles"
  ) {
    if (!["true", "false"].includes(value)) throw new Error("Invalid setting");
    publicConfig[field] = value === "true";
  } else {
    publicConfig[field] = value;
  }
  await saveProviderConfig("apollo", secrets, publicConfig);
}
