import { appUrl, optionalEnv } from "@/lib/env";
import { getElevenLabsConfig } from "@/lib/providers/config";
import type { ReceptionistConfig } from "@/lib/db/schema";

/**
 * Builders for 46elks call-action JSON structures
 * (https://46elks.com/docs/call-actions).
 */

export type ElksCallAction = Record<string, unknown>;

function webhookUrl(path: string): string {
  const base = appUrl() ?? "http://localhost:3000";
  const url = new URL(path, base);
  const token = optionalEnv("WEBHOOK_TOKEN");
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function hangupUrl(): string {
  return webhookUrl("/api/webhooks/46elks/hangup");
}

export function recordingWebhookUrl(params?: Record<string, string>): string {
  const url = new URL(webhookUrl("/api/webhooks/46elks/recording"));
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

function publicAudioUrl(id: string): string {
  return webhookUrl(`/api/public/audio/${id}`);
}

/** AI gate: play a cloned prompt, then capture one caller turn. */
export function gateCaptureAction(
  config: ReceptionistConfig,
  attempt: number,
): ElksCallAction {
  const audioId =
    attempt > 1 ? config.retryAudioId : config.greetingAudioId;
  if (!audioId) throw new Error("Receptionist voice prompts are not generated");
  return gateCaptureWithAudio(audioId, attempt);
}

export function gateCaptureWithAudio(
  audioId: string,
  attempt: number,
): ElksCallAction {
  return {
    play: publicAudioUrl(audioId),
    next: {
      record: recordingWebhookUrl({
        stage: "gate",
        attempt: String(attempt),
      }),
      timelimit: 90,
      silencedetection: "yes",
      next: webhookUrl(
        `/api/webhooks/46elks/voice/gate?attempt=${attempt}`,
      ),
      whenhangup: hangupUrl(),
    },
    whenhangup: hangupUrl(),
  };
}

export function gateResultAction(args: {
  audioId: string;
  nextPath?: string;
}): ElksCallAction {
  return {
    play: publicAudioUrl(args.audioId),
    ...(args.nextPath ? { next: webhookUrl(args.nextPath) } : {}),
    skippable: false,
    whenhangup: hangupUrl(),
  };
}

/** Ring the owner's phone; on no answer/busy, the after-connect webhook decides (voicemail). */
export function connectAction(ownerNumber: string): ElksCallAction {
  return {
    connect: ownerNumber,
    // 46elks records the complete bridged conversation and posts its WAV URL
    // to this webhook when the call ends.
    recordcall: recordingWebhookUrl(),
    timeout: 25,
    next: webhookUrl("/api/webhooks/46elks/voice/after-connect"),
    whenhangup: hangupUrl(),
  };
}

/**
 * Voicemail / screening: optional greeting, then record. The recording is
 * posted to the recording webhook (wav URL), where it is transcribed and
 * summarized.
 */
export async function voicemailAction(
  kind: "VOICEMAIL" | "SCREEN",
): Promise<ElksCallAction> {
  const generatedGreeting = await elevenLabsGreeting(kind);
  const greeting =
    generatedGreeting ??
    (kind === "SCREEN"
      ? (optionalEnv("SCREEN_GREETING_URL") ??
        optionalEnv("VOICE_GREETING_URL"))
      : optionalEnv("VOICE_GREETING_URL"));
  const record: ElksCallAction = {
    record: recordingWebhookUrl(),
    timelimit: 120,
    whenhangup: hangupUrl(),
  };
  if (greeting) {
    return {
      play: greeting,
      next: record,
      whenhangup: hangupUrl(),
    };
  }
  return record;
}

async function elevenLabsGreeting(
  kind: "VOICEMAIL" | "SCREEN",
): Promise<string | null> {
  try {
    const config = await getElevenLabsConfig();
    const id =
      kind === "SCREEN"
        ? config.screeningAudioId
        : config.voicemailAudioId;
    const publicUrl = appUrl();
    const token = optionalEnv("WEBHOOK_TOKEN");
    if (!id || !publicUrl || !token) return null;
    const url = new URL(`/api/public/audio/${id}`, publicUrl);
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return null;
  }
}

/** Decline the call with a busy signal. */
export function rejectAction(): ElksCallAction {
  return { hangup: "reject" };
}
