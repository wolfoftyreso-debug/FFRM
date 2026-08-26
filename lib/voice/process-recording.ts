import { getDb } from "@/lib/db";
import { calls, contacts } from "@/lib/db/schema";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { transcribeAudio, generateStructured } from "@/lib/ai/client";
import { fastModel } from "@/lib/ai/config";
import { appUrl, optionalEnv } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { notifyOwner } from "@/lib/sms/send-message";
import { contactDisplayName } from "@/lib/ai/context";
import { appendConversationEvent } from "@/lib/conversation-events";
import { getElksCredentials } from "@/lib/providers/config";
import { elksBasicAuth } from "@/lib/providers/elks46";

const voicemailAnalysisSchema = z.object({
  summary: z.string(),
  topic: z.string(),
  requiresUser: z.boolean(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

/**
 * Call recording post-processing: fetch and permanently persist the WAV within
 * 46elks' 72-hour window, transcribe through AI Gateway, then summarize.
 * An expiring lease makes crashes retryable; processedAt means the durable
 * audio and transcript are fully persisted.
 */
export async function processCallRecording(callId: string): Promise<void> {
  const db = await getDb();

  const staleLease = new Date(Date.now() - 5 * 60 * 1000);
  const claimed = await db
    .update(calls)
    .set({
      recordingProcessingStartedAt: new Date(),
      recordingAttemptCount: sql`${calls.recordingAttemptCount} + 1`,
    })
    .where(
      and(
        eq(calls.id, callId),
        isNull(calls.processedAt),
        lt(calls.recordingAttemptCount, 5),
        or(
          isNull(calls.recordingProcessingStartedAt),
          lt(calls.recordingProcessingStartedAt, staleLease),
        ),
      ),
    )
    .returning();
  if (claimed.length === 0) return;
  const call = claimed[0];
  if (!call.recordingUrl) return;

  const contact = call.contactId
    ? (
        await db.select().from(contacts).where(eq(contacts.id, call.contactId))
      )[0]
    : null;
  const who = contact ? contactDisplayName(contact) : call.fromNumber;
  const publicUrl = appUrl() ?? "";
  const isVoicemail = call.recordingKind !== "CALL";

  try {
    const { username, password } = await getElksCredentials();
    const res = await fetch(call.recordingUrl, {
      headers: {
        Authorization:
          elksBasicAuth(username, password),
      },
    });
    if (!res.ok) throw new Error(`Recording fetch failed (${res.status})`);
    const audio = new Uint8Array(await res.arrayBuffer());
    await db
      .update(calls)
      .set({
        recordingDataBase64: Buffer.from(audio).toString("base64"),
        recordingMimeType:
          res.headers.get("content-type")?.split(";")[0] || "audio/wav",
        recordingByteSize: audio.byteLength,
      })
      .where(eq(calls.id, call.id));

    const transcript = await transcribeAudio({
      model:
        optionalEnv("AI_MODEL_TRANSCRIBE") ?? "fish-audio/transcribe-1",
      audio,
      purpose: isVoicemail ? "voicemail-transcribe" : "call-transcribe",
    });

    let analysis: z.infer<typeof voicemailAnalysisSchema> | null = null;
    if (transcript.text.trim()) {
      const result = await generateStructured({
        model: fastModel(),
        system:
          "You summarize phone transcripts for a private personal assistant. Summarize in the language of the transcript, in 1-2 sentences. Decide whether the conversation contains a decision, promise, request, or follow-up that requires the owner to act. Do not invent details.",
        prompt: `Caller: ${who}${contact ? ` (${contact.relationshipType})` : " (unknown caller)"}
${isVoicemail ? "Voicemail" : "Full call"} transcript:
"${transcript.text}"`,
        schema: voicemailAnalysisSchema,
        purpose: isVoicemail ? "voicemail-analysis" : "call-analysis",
      });
      analysis = result.output;
    }

    await db
      .update(calls)
      .set({
        state: isVoicemail ? "VOICEMAIL" : call.state,
        transcript: transcript.text || null,
        aiSummary: analysis?.summary ?? null,
        aiTopic: analysis?.topic ?? null,
        aiRequiresUser: analysis?.requiresUser ?? null,
      })
      .where(eq(calls.id, call.id));

    await logActivity({
      actor: "AI",
      action: isVoicemail ? "VOICEMAIL_PROCESSED" : "CALL_TRANSCRIBED",
      summary: `${isVoicemail ? "Voicemail" : "Call"} with ${who} transcribed${analysis ? `: ${analysis.summary.slice(0, 120)}` : ""}`,
      contactId: call.contactId,
      entityType: "call",
      entityId: call.id,
    });
    await appendConversationEvent({
      conversationId: call.conversationId,
      contactId: call.contactId,
      channel: isVoicemail ? "VOICEMAIL" : "VOICE_CALL",
      eventKey: `${call.providerCallId}:transcript`,
      text: `${isVoicemail ? "Voicemail" : "Call transcript"}${analysis ? ` · ${analysis.summary}` : ""}${
        analysis?.requiresUser ? " · NEEDS YOU" : ""
      }`,
      sender: "AI",
    });

    let notified = true;
    if (isVoicemail) {
      notified = await notifyOwner(
        `Röstmeddelande från ${who}${analysis ? `:\n${analysis.summary}` : "."}${
          analysis?.requiresUser ? "\nKräver dig." : ""
        }\n\n${publicUrl}/phone/${call.id}`,
      );
      if (!notified) throw new Error("Owner voicemail notification failed");
    }
    await db
      .update(calls)
      .set({
        processedAt: new Date(),
        recordingProcessingStartedAt: null,
        voicemailNotifiedAt: isVoicemail && notified ? new Date() : null,
        error: null,
      })
      .where(eq(calls.id, call.id));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const finalAiAttempt = call.recordingAttemptCount >= 3;
    await db
      .update(calls)
      .set({
        state: isVoicemail ? "VOICEMAIL" : call.state,
        error: message,
        recordingProcessingStartedAt: null,
      })
      .where(eq(calls.id, call.id));
    await logActivity({
      actor: "SYSTEM",
      action: isVoicemail
        ? "VOICEMAIL_PROCESSING_FAILED"
        : "CALL_TRANSCRIPTION_FAILED",
      summary: `${isVoicemail ? "Voicemail" : "Call"} with ${who} could not be transcribed: ${message.slice(0, 150)}`,
      contactId: call.contactId,
      entityType: "call",
      entityId: call.id,
    });
    if (finalAiAttempt && isVoicemail) {
      await appendConversationEvent({
        conversationId: call.conversationId,
        contactId: call.contactId,
        channel: "VOICEMAIL",
        eventKey: `${call.providerCallId}:transcript`,
        text: "Voicemail received · transcription failed · NEEDS YOU",
      });
      // After AI retries are exhausted, notify without a transcript.
      const notified = await notifyOwner(
        `Nytt röstmeddelande från ${who} (kunde inte transkriberas).\n\n${publicUrl}/phone`,
      );
      if (notified || call.recordingAttemptCount >= 5) {
        await db
          .update(calls)
          .set({
            processedAt: new Date(),
            recordingProcessingStartedAt: null,
            voicemailNotifiedAt: notified ? new Date() : null,
          })
          .where(eq(calls.id, call.id));
      }
    }
  }
}
