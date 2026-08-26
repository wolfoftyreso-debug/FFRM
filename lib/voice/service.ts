import { getDb } from "@/lib/db";
import {
  blockedNumbers,
  calls,
  contacts,
  users,
  type Call,
  type Contact,
} from "@/lib/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { normalizePhoneNumber } from "@/lib/phone";
import { decideCallRouting } from "./policy";
import {
  connectAction,
  voicemailAction,
  rejectAction,
  type ElksCallAction,
} from "./actions";
import { logActivity } from "@/lib/activity";
import { notifyOwner } from "@/lib/sms/send-message";
import { requireEnv, optionalEnv } from "@/lib/env";
import { contactDisplayName } from "@/lib/ai/context";

export interface IncomingCallInput {
  callid: string;
  from: string;
  to: string;
}

/** Resolves the number the owner's real phone is reached on. */
async function ownerPhone(): Promise<string | null> {
  const db = await getDb();
  const [owner] = await db.select().from(users).limit(1);
  return owner?.phoneNumber ?? optionalEnv("OWNER_PHONE_NUMBER") ?? null;
}

/**
 * voice_start handler: persist the call, run the policy engine, respond with
 * the 46elks action. Idempotent per provider call id — 46elks retries
 * failed webhooks for hours.
 */
export async function handleIncomingCall(
  input: IncomingCallInput,
): Promise<ElksCallAction> {
  const db = await getDb();
  const from = normalizePhoneNumber(input.from) ?? input.from;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.phoneNumber, from))
    .limit(1);

  const [blocked] = await db
    .select()
    .from(blockedNumbers)
    .where(eq(blockedNumbers.phoneNumber, from))
    .limit(1);

  const [owner] = await db.select().from(users).limit(1);
  const decision = decideCallRouting({
    contact: contact ?? null,
    isBlocked: !!blocked || contact?.callPolicy === "BLOCK",
    globalPolicy: owner?.callPolicy,
    timezone: contact?.timezone ?? owner?.timezone,
  });

  const target = await ownerPhone();
  // Without a reachable owner phone, ring-through is impossible.
  const disposition =
    decision.disposition === "RING_THROUGH" && !target
      ? "VOICEMAIL"
      : decision.disposition;

  const inserted = await db
    .insert(calls)
    .values({
      providerCallId: input.callid,
      contactId: contact?.id ?? null,
      direction: "INBOUND",
      fromNumber: from,
      toNumber: input.to,
      state: "RINGING",
      disposition,
      policyReason: decision.reason,
    })
    .onConflictDoNothing()
    .returning({ id: calls.id });

  if (inserted.length > 0) {
    if (contact) {
      await db
        .update(contacts)
        .set({ lastInteractionAt: new Date(), updatedAt: sql`now()` })
        .where(eq(contacts.id, contact.id));
    }
    await logActivity({
      actor: "46ELKS",
      action: "CALL_RECEIVED",
      summary: `Incoming call from ${contact ? contactDisplayName(contact) : from} → ${disposition} (${decision.reason})`,
      contactId: contact?.id ?? null,
      entityType: "call",
      entityId: inserted[0].id,
    });
  }

  switch (disposition) {
    case "RING_THROUGH":
      return connectAction(target!);
    case "VOICEMAIL":
      return voicemailAction("VOICEMAIL");
    case "SCREEN":
      return voicemailAction("SCREEN");
    case "REJECT":
      return rejectAction();
  }
}

/**
 * Called by 46elks when the connect action completes: success means the call
 * was answered and is over; failed means no answer/busy → voicemail.
 */
export async function handleAfterConnect(
  callid: string,
  result: string,
): Promise<ElksCallAction> {
  const db = await getDb();
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.providerCallId, callid));

  if (result === "success") {
    if (call && call.state === "RINGING") {
      await db
        .update(calls)
        .set({ state: "CONNECTED", answeredAt: new Date() })
        .where(eq(calls.id, call.id));
    }
    return { hangup: "" };
  }

  // No answer → voicemail (state updated; MISSED is set at hangup if the
  // caller leaves no message).
  if (call) {
    await db
      .update(calls)
      .set({ state: "VOICEMAIL" })
      .where(eq(calls.id, call.id));
  }
  return voicemailAction("VOICEMAIL");
}

export interface HangupInput {
  id: string;
  state?: string; // success | failed | busy
  duration?: number;
}

/** whenhangup handler: final call state, missed-call detection + notification. */
export async function handleHangup(input: HangupInput): Promise<void> {
  const db = await getDb();
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.providerCallId, input.id));
  if (!call) return;

  let finalState = call.state;
  if (call.state === "CONNECTED") {
    finalState = "COMPLETED";
  } else if (call.state === "RINGING") {
    finalState = call.disposition === "REJECT" ? "REJECTED" : "MISSED";
  } else if (call.state === "VOICEMAIL" && !call.recordingUrl) {
    // Caller hung up without leaving a message.
    finalState = "MISSED";
  }

  await db
    .update(calls)
    .set({
      state: finalState,
      durationSeconds: input.duration ?? call.durationSeconds,
      endedAt: new Date(),
    })
    .where(eq(calls.id, call.id));

  const contact = call.contactId
    ? (
        await db.select().from(contacts).where(eq(contacts.id, call.contactId))
      )[0]
    : null;
  const who = contact ? contactDisplayName(contact) : call.fromNumber;

  await logActivity({
    actor: "46ELKS",
    action: `CALL_${finalState}`,
    summary: `Call ${call.direction === "INBOUND" ? "from" : "to"} ${who} ended: ${finalState.toLowerCase()}${input.duration ? ` (${input.duration}s)` : ""}`,
    contactId: call.contactId,
    entityType: "call",
    entityId: call.id,
  });

  // Missed inbound calls notify the owner (their phone shows the 46elks
  // number, not the actual caller — this SMS restores that information).
  if (finalState === "MISSED" && call.direction === "INBOUND") {
    const appUrl = optionalEnv("APP_URL") ?? "";
    await notifyOwner(`Missat samtal från ${who}.\n\n${appUrl}/phone`);
  }
}

/**
 * Owner-initiated callback: the system calls the owner's phone first, then
 * connects the call to the contact. The contact sees the 46elks number —
 * the system's communication identity.
 */
export async function initiateCallback(contact: Contact): Promise<Call> {
  const db = await getDb();
  if (!contact.phoneNumber) throw new Error("Contact has no phone number");
  const target = await ownerPhone();
  if (!target) throw new Error("No owner phone number configured");

  const username = requireEnv("ELKS46_USERNAME");
  const password = requireEnv("ELKS46_PASSWORD");
  const from = requireEnv("ELKS46_FROM_NUMBER");

  const body = new URLSearchParams({
    from,
    to: target,
    voice_start: JSON.stringify({ connect: contact.phoneNumber }),
    whenhangup: new URL(
      `/api/webhooks/46elks/hangup${optionalEnv("WEBHOOK_TOKEN") ? `?token=${optionalEnv("WEBHOOK_TOKEN")}` : ""}`,
      optionalEnv("APP_URL") ?? "http://localhost:3000",
    ).toString(),
  });

  const res = await fetch("https://api.46elks.com/a1/calls", {
    method: "POST",
    headers: {
      Authorization:
        "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`46elks call failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { id?: string; state?: string };

  const [record] = await db
    .insert(calls)
    .values({
      providerCallId: data.id ?? `local-${Date.now()}`,
      contactId: contact.id,
      direction: "OUTBOUND",
      fromNumber: from,
      toNumber: contact.phoneNumber,
      state: "RINGING",
      disposition: "CONNECT_BACK",
      policyReason: "Owner-initiated callback",
    })
    .returning();

  await logActivity({
    actor: "USER",
    action: "CALL_INITIATED",
    summary: `Callback started to ${contactDisplayName(contact)}`,
    contactId: contact.id,
    entityType: "call",
    entityId: record.id,
  });

  return record;
}

/** Recordings not yet processed (cron fallback). */
export async function findUnprocessedRecordings(olderThan: Date) {
  const db = await getDb();
  return db
    .select({ id: calls.id })
    .from(calls)
    .where(
      and(
        isNull(calls.processedAt),
        sql`${calls.recordingUrl} is not null`,
        sql`${calls.createdAt} < ${olderThan}`,
      ),
    )
    .limit(10);
}
