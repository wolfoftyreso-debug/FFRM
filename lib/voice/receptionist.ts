import "server-only";

import { and, asc, eq, isNotNull, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  callScreeningTurns,
  calls,
  contacts,
  conversations,
  audioAssets,
  reminders,
  users,
  type Call,
  type ReceptionistConfig,
} from "@/lib/db/schema";
import { normalizePhoneNumber } from "@/lib/phone";
import { transcribeAudio, generateStructured } from "@/lib/ai/client";
import { fastModel } from "@/lib/ai/config";
import { optionalEnv, appUrl } from "@/lib/env";
import { getElksCredentials } from "@/lib/providers/config";
import { elksBasicAuth } from "@/lib/providers/elks46";
import {
  connectAction,
  gateCaptureAction,
  gateCaptureWithAudio,
  gateResultAction,
  hangupUrl,
  type ElksCallAction,
} from "@/lib/voice/actions";
import {
  getReceptionistState,
  isOwnerAjour,
} from "@/lib/voice/receptionist-config";
import { appendConversationEvent } from "@/lib/conversation-events";
import { logActivity } from "@/lib/activity";
import { notifyOwner } from "@/lib/sms/send-message";

const gateAnalysisSchema = z.object({
  callerName: z.string().nullable(),
  purpose: z.string().nullable(),
  summary: z.string().min(1).max(500),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]),
  hasName: z.boolean(),
  hasPurpose: z.boolean(),
  openQuestion: z.string().min(1).max(300).nullable(),
});

export async function processGateRecording(input: {
  providerCallId: string;
  attempt: number;
  recordingUrl: string;
  durationSeconds?: number;
}): Promise<void> {
  const db = await getDb();
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.providerCallId, input.providerCallId))
    .limit(1);
  if (!call) return;
  const [existing] = await db
    .select()
    .from(callScreeningTurns)
    .where(
      and(
        eq(callScreeningTurns.callId, call.id),
        eq(callScreeningTurns.attempt, input.attempt),
      ),
    )
    .limit(1);
  if (existing?.transcript) return;

  const { username, password } = await getElksCredentials();
  const response = await fetch(input.recordingUrl, {
    headers: { Authorization: elksBasicAuth(username, password) },
  });
  if (!response.ok) {
    throw new Error(`Gate recording fetch failed (${response.status})`);
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (!audio.byteLength) throw new Error("Gate recording was empty");
  if (audio.byteLength > 12 * 1024 * 1024) {
    throw new Error("Gate recording exceeds 12MB");
  }
  const transcription = await transcribeAudio({
    model: optionalEnv("AI_MODEL_TRANSCRIBE") ?? "fish-audio/transcribe-1",
    audio,
    purpose: "receptionist-gate-transcribe",
  });
  await db
    .insert(callScreeningTurns)
    .values({
      callId: call.id,
      attempt: input.attempt,
      recordingUrl: input.recordingUrl,
      audioDataBase64: Buffer.from(audio).toString("base64"),
      audioMimeType:
        response.headers.get("content-type")?.split(";")[0] || "audio/wav",
      durationSeconds: input.durationSeconds ?? null,
      transcript: transcription.text,
    })
    .onConflictDoUpdate({
      target: [callScreeningTurns.callId, callScreeningTurns.attempt],
      set: {
        recordingUrl: input.recordingUrl,
        audioDataBase64: Buffer.from(audio).toString("base64"),
        audioMimeType:
          response.headers.get("content-type")?.split(";")[0] || "audio/wav",
        durationSeconds: input.durationSeconds ?? null,
        transcript: transcription.text,
      },
    });

  const turns = await db
    .select()
    .from(callScreeningTurns)
    .where(eq(callScreeningTurns.callId, call.id))
    .orderBy(asc(callScreeningTurns.attempt));
  const fullTranscript = turns
    .map((turn) => turn.transcript)
    .filter(Boolean)
    .join("\n");
  const analysis = await generateStructured({
    model: fastModel(),
    system:
      "You are a careful Swedish AI receptionist. Extract only what the caller explicitly said. A name must identify the caller, not another person. Purpose must explain why they want the owner. CRITICAL means a credible immediate threat to life, safety, or severe ongoing harm; ordinary urgency is HIGH. Never invent missing identity or purpose. If both are present, write one short, intelligent, open Swedish follow-up question that begins naturally with a brief acknowledgement such as 'Mm, jag förstår.' and helps clarify what the owner needs to know.",
    prompt: `Caller number: ${call.fromNumber}
Transcript:
${fullTranscript}

Return the caller's name, purpose, a concise Swedish summary, urgency, and whether both required gate fields are actually present.`,
    schema: gateAnalysisSchema,
    purpose: "receptionist-gate-analysis",
  });
  const resolvedContactId = await resolveCallerContact(
    call,
    analysis.output.callerName,
  );
  const questionAudio =
    input.attempt === 1 &&
    analysis.output.hasName &&
    analysis.output.hasPurpose &&
    analysis.output.openQuestion
      ? await createQuestionAudio(analysis.output.openQuestion)
      : null;
  await db
    .update(calls)
    .set({
      contactId: resolvedContactId ?? call.contactId,
      callerName: analysis.output.hasName
        ? analysis.output.callerName
        : call.callerName,
      callerPurpose: analysis.output.hasPurpose
        ? analysis.output.purpose
        : call.callerPurpose,
      screeningTranscript: fullTranscript,
      screeningSummary: analysis.output.summary,
      screeningQuestion:
        questionAudio?.text ?? call.screeningQuestion ?? null,
      screeningQuestionAudioId:
        questionAudio?.audioId ?? call.screeningQuestionAudioId ?? null,
      screeningUrgency: analysis.output.urgency,
      screeningState: "EVALUATED",
      screeningAttemptCount: Math.max(
        call.screeningAttemptCount,
        input.attempt,
      ),
      screenedAt: new Date(),
    })
    .where(eq(calls.id, call.id));
  await appendConversationEvent({
    conversationId: call.conversationId,
    contactId: resolvedContactId ?? call.contactId,
    channel: "VOICE_CALL",
    eventKey: `${call.providerCallId}:gate:${input.attempt}`,
    text: `AI-växel · ${analysis.output.callerName ?? "namn saknas"} · ${
      analysis.output.purpose ?? "ärende saknas"
    } · ${analysis.output.urgency}`,
    sender: "AI",
  });
}

export async function decideGateAction(
  providerCallId: string,
  attempt: number,
): Promise<ElksCallAction> {
  const state = await getReceptionistState();
  if (!state) return { hangup: "busy" };
  const db = await getDb();
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.providerCallId, providerCallId))
    .limit(1);
  if (!call) return { hangup: "busy" };

  const hasGate = !!call.callerName?.trim() && !!call.callerPurpose?.trim();
  if (hasGate && attempt < 2 && call.screeningQuestionAudioId) {
    await db
      .update(calls)
      .set({ screeningState: "ASKING_OPEN_QUESTION" })
      .where(eq(calls.id, call.id));
    return gateCaptureWithAudio(call.screeningQuestionAudioId, 2);
  }
  if (!hasGate && attempt < 2) {
    await db
      .update(calls)
      .set({ screeningState: "ASKING_AGAIN" })
      .where(eq(calls.id, call.id));
    return gateCaptureAction(state.config, attempt + 1);
  }
  if (!hasGate) {
    await createCallbackTicket(call, "Namn eller ärende kunde inte bekräftas");
    return callbackAction(state.config);
  }

  const availability = isOwnerAjour({
    config: state.config,
    lastActiveAt: state.owner.lastActiveAt,
    timezone: state.owner.timezone,
  });
  const critical = call.screeningUrgency === "CRITICAL";
  if ((availability.available || critical) && state.owner.phoneNumber) {
    await db
      .update(calls)
      .set({
        state: "RINGING",
        disposition: "RING_THROUGH",
        routedToNumber: state.owner.phoneNumber,
        screeningState: "READY_TO_CONNECT",
        screeningDecision: "CONNECT",
        policyReason: critical
          ? "AI gate: critical urgency"
          : `AI gate: ${availability.reason}`,
      })
      .where(eq(calls.id, call.id));
    return gateResultAction({
      audioId: state.config.connectAudioId!,
      nextPath: `/api/webhooks/46elks/voice/gate/connect?callid=${encodeURIComponent(
        providerCallId,
      )}`,
    });
  }
  await createCallbackTicket(call, availability.reason);
  return callbackAction(state.config);
}

async function createQuestionAudio(
  text: string,
): Promise<{ text: string; audioId: string } | null> {
  try {
    const { generateElevenLabsSpeech } = await import(
      "@/lib/providers/elevenlabs"
    );
    const audio = await generateElevenLabsSpeech(text);
    const db = await getDb();
    const [asset] = await db
      .insert(audioAssets)
      .values({
        provider: "elevenlabs",
        purpose: "RECEPTIONIST_OPEN_QUESTION",
        mimeType: audio.mimeType,
        dataBase64: Buffer.from(audio.data).toString("base64"),
        byteSize: audio.data.byteLength,
        sourceText: text,
      })
      .returning();
    return { text, audioId: asset.id };
  } catch {
    // A TTS outage must not strand the caller; route using the first answer.
    return null;
  }
}

export async function connectScreenedCall(
  providerCallId: string,
  afterHold = false,
): Promise<ElksCallAction> {
  const state = await getReceptionistState();
  const db = await getDb();
  const [call] = await db
    .select()
    .from(calls)
    .where(eq(calls.providerCallId, providerCallId))
    .limit(1);
  if (
    !state ||
    !call ||
    call.screeningDecision !== "CONNECT" ||
    !call.callerName ||
    !call.callerPurpose ||
    !call.routedToNumber
  ) {
    return { hangup: "busy" };
  }
  const holdUrl = state.config.licensedHoldAudioUrl?.trim();
  if (holdUrl && !afterHold) {
    return {
      play: holdUrl,
      skippable: false,
      whenhangup: hangupUrl(),
      next: new URL(
        `/api/webhooks/46elks/voice/gate/connect?callid=${encodeURIComponent(
          providerCallId,
        )}&afterHold=1${optionalEnv("WEBHOOK_TOKEN") ? `&token=${encodeURIComponent(optionalEnv("WEBHOOK_TOKEN")!)}` : ""}`,
        appUrl() ?? "http://localhost:3000",
      ).toString(),
    };
  }
  return connectAction(call.routedToNumber);
}

export async function createCallbackTicket(
  call: Call,
  reason: string,
): Promise<string> {
  const db = await getDb();
  if (call.callbackTicketId) return call.callbackTicketId;
  const title = `Ring tillbaka: ${call.callerName ?? call.fromNumber}`;
  const [ticket] = await db
    .insert(reminders)
    .values({
      contactId: call.contactId,
      kind: "TASK",
      title,
      description: [
        call.callerPurpose ? `Ärende: ${call.callerPurpose}` : null,
        call.screeningSummary ? `Sammanfattning: ${call.screeningSummary}` : null,
        `Telefon: ${call.fromNumber}`,
        `Orsak: ${reason}`,
      ]
        .filter(Boolean)
        .join("\n"),
      dueAt: new Date(),
      priority:
        call.screeningUrgency === "CRITICAL" ||
        call.screeningUrgency === "HIGH"
          ? "HIGH"
          : "MEDIUM",
      sourceCallId: call.id,
      repeatEveryMinutes: 15,
    })
    .returning();
  const claimed = await db
    .update(calls)
    .set({
      callbackTicketId: ticket.id,
      screeningDecision: "CALLBACK",
      screeningState: "CALLBACK_CREATED",
      disposition: "CALLBACK",
      state: "SCREENED_CALLBACK",
      aiRequiresUser: true,
    })
    .where(
      and(eq(calls.id, call.id), sql`${calls.callbackTicketId} is null`),
    )
    .returning({ id: calls.id });
  if (!claimed.length) {
    await db.delete(reminders).where(eq(reminders.id, ticket.id));
    const [winner] = await db
      .select({ id: calls.callbackTicketId })
      .from(calls)
      .where(eq(calls.id, call.id));
    return winner?.id ?? ticket.id;
  }
  const detailUrl = `${appUrl() ?? ""}/phone/${call.id}`;
  const notified = await notifyOwner(
    `${title}\n${call.callerPurpose ?? "Ärende saknas"}\n${detailUrl}`,
  );
  await db
    .update(reminders)
    .set({
      dueAt: new Date(Date.now() + 15 * 60_000),
      lastNotifiedAt: notified ? new Date() : null,
      notificationCount: notified ? 1 : 0,
      updatedAt: sql`now()`,
    })
    .where(eq(reminders.id, ticket.id));
  await logActivity({
    actor: "AI",
    action: "CALLBACK_TICKET_CREATED",
    summary: `${title}: ${call.callerPurpose ?? reason}`,
    contactId: call.contactId,
    entityType: "reminder",
    entityId: ticket.id,
  });
  return ticket.id;
}

export async function processCallbackNotifications(
  now = new Date(),
): Promise<number> {
  const db = await getDb();
  const due = await db
    .select({ ticket: reminders, call: calls })
    .from(reminders)
    .innerJoin(calls, eq(reminders.sourceCallId, calls.id))
    .where(
      and(
        eq(reminders.kind, "TASK"),
        eq(reminders.status, "PENDING"),
        isNotNull(reminders.repeatEveryMinutes),
        lte(reminders.dueAt, now),
      ),
    )
    .limit(20);
  let sent = 0;
  for (const { ticket, call } of due) {
    const ok = await notifyOwner(
      `Påminnelse: ${ticket.title}\n${
        call.callerPurpose ?? call.screeningSummary ?? call.fromNumber
      }\n${appUrl() ?? ""}/phone/${call.id}`,
    );
    if (!ok) continue;
    await db
      .update(reminders)
      .set({
        lastNotifiedAt: now,
        notificationCount: sql`${reminders.notificationCount} + 1`,
        dueAt: new Date(
          now.getTime() + (ticket.repeatEveryMinutes ?? 15) * 60_000,
        ),
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(reminders.id, ticket.id),
          eq(reminders.status, "PENDING"),
        ),
      );
    sent += 1;
  }
  return sent;
}

async function resolveCallerContact(
  call: Call,
  callerName: string | null,
): Promise<string | null> {
  if (call.contactId || !callerName?.trim()) return call.contactId;
  const db = await getDb();
  const phoneNumber = normalizePhoneNumber(call.fromNumber);
  if (!phoneNumber) return null;
  const [known] = await db
    .select({ id: contacts.id })
    .from(contacts)
    .where(eq(contacts.phoneNumber, phoneNumber))
    .limit(1);
  if (known) return known.id;
  const [owner] = await db.select({ id: users.id }).from(users).limit(1);
  if (!owner) return null;
  const parts = callerName.trim().split(/\s+/);
  const [created] = await db
    .insert(contacts)
    .values({
      userId: owner.id,
      firstName: parts[0].slice(0, 80),
      lastName: parts.slice(1).join(" ").slice(0, 120) || null,
      phoneNumber,
      relationshipType: "OTHER",
      notes: "Skapad automatiskt av AI-växeln efter att inringaren uppgav sitt namn.",
    })
    .onConflictDoNothing()
    .returning({ id: contacts.id });
  const contactId =
    created?.id ??
    (
      await db
        .select({ id: contacts.id })
        .from(contacts)
        .where(eq(contacts.phoneNumber, phoneNumber))
        .limit(1)
    )[0]?.id ??
    null;
  if (contactId && call.conversationId) {
    await db
      .update(conversations)
      .set({ contactId })
      .where(
        and(
          eq(conversations.id, call.conversationId),
          sql`${conversations.contactId} is null`,
        ),
      );
  }
  return contactId;
}

function callbackAction(
  config: ReceptionistConfig,
): ElksCallAction {
  return gateResultAction({ audioId: config.callbackAudioId! });
}
