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

const inputSchema = z.object({
  section: z.enum(["owner", "callPolicy", "46elks", "elevenlabs"]),
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
    else if (input.section === "46elks")
      await saveElksField(input.field, input.value);
    else await saveElevenField(input.field, input.value);
    return NextResponse.json({ ok: true, savedAt: new Date().toISOString() });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cleanErrorMessage(error, 240) },
      { status: 400 },
    );
  }
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
