import { getDb } from "@/lib/db";
import { calls, contacts } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { transcribeAudio, generateStructured } from "@/lib/ai/client";
import { fastModel } from "@/lib/ai/config";
import { optionalEnv, requireEnv } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { notifyOwner } from "@/lib/sms/send-message";
import { contactDisplayName } from "@/lib/ai/context";

const voicemailAnalysisSchema = z.object({
  summary: z.string(),
  topic: z.string(),
  requiresUser: z.boolean(),
  urgency: z.enum(["LOW", "MEDIUM", "HIGH"]),
});

/**
 * Voicemail post-processing: fetch the WAV from 46elks (basic auth),
 * transcribe through the AI Gateway, summarize/classify with the fast model,
 * then notify the owner. Idempotent via an atomic claim on processedAt.
 * Failures never lose the voicemail — the owner is notified regardless.
 */
export async function processCallRecording(callId: string): Promise<void> {
  const db = await getDb();

  const claimed = await db
    .update(calls)
    .set({ processedAt: new Date() })
    .where(and(eq(calls.id, callId), isNull(calls.processedAt)))
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
  const appUrl = optionalEnv("APP_URL") ?? "";

  try {
    const username = requireEnv("ELKS46_USERNAME");
    const password = requireEnv("ELKS46_PASSWORD");
    const res = await fetch(call.recordingUrl, {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${username}:${password}`).toString("base64"),
      },
    });
    if (!res.ok) throw new Error(`Recording fetch failed (${res.status})`);
    const audio = new Uint8Array(await res.arrayBuffer());

    const transcript = await transcribeAudio({
      model: optionalEnv("AI_MODEL_TRANSCRIBE") ?? "openai/whisper-1",
      audio,
      purpose: "voicemail-transcribe",
    });

    let analysis: z.infer<typeof voicemailAnalysisSchema> | null = null;
    if (transcript.text.trim()) {
      const result = await generateStructured({
        model: fastModel(),
        system:
          "You summarize voicemail transcripts for a personal phone assistant. Summarize in the language of the transcript, in 1-2 sentences. Decide whether the message requires the owner to act.",
        prompt: `Caller: ${who}${contact ? ` (${contact.relationshipType})` : " (unknown caller)"}
Voicemail transcript:
"${transcript.text}"`,
        schema: voicemailAnalysisSchema,
        purpose: "voicemail-analysis",
      });
      analysis = result.output;
    }

    await db
      .update(calls)
      .set({
        state: "VOICEMAIL",
        transcript: transcript.text || null,
        aiSummary: analysis?.summary ?? null,
        aiTopic: analysis?.topic ?? null,
        aiRequiresUser: analysis?.requiresUser ?? null,
      })
      .where(eq(calls.id, call.id));

    await logActivity({
      actor: "AI",
      action: "VOICEMAIL_PROCESSED",
      summary: `Voicemail from ${who} transcribed${analysis ? `: ${analysis.summary.slice(0, 120)}` : ""}`,
      contactId: call.contactId,
      entityType: "call",
      entityId: call.id,
    });

    await notifyOwner(
      `Röstmeddelande från ${who}${analysis ? `:\n${analysis.summary}` : "."}${
        analysis?.requiresUser ? "\nKräver dig." : ""
      }\n\n${appUrl}/phone`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(calls)
      .set({ state: "VOICEMAIL", error: message })
      .where(eq(calls.id, call.id));
    await logActivity({
      actor: "SYSTEM",
      action: "VOICEMAIL_PROCESSING_FAILED",
      summary: `Voicemail from ${who} could not be transcribed: ${message.slice(0, 150)}`,
      contactId: call.contactId,
      entityType: "call",
      entityId: call.id,
    });
    // Never lose communication: the owner still learns about the voicemail.
    await notifyOwner(
      `Nytt röstmeddelande från ${who} (kunde inte transkriberas).\n\n${appUrl}/phone`,
    );
  }
}
