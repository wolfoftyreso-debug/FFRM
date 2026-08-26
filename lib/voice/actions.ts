import { optionalEnv } from "@/lib/env";

/**
 * Builders for 46elks call-action JSON structures
 * (https://46elks.com/docs/call-actions).
 */

export type ElksCallAction = Record<string, unknown>;

function webhookUrl(path: string): string {
  const base = optionalEnv("APP_URL") ?? "http://localhost:3000";
  const url = new URL(path, base);
  const token = optionalEnv("WEBHOOK_TOKEN");
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export function hangupUrl(): string {
  return webhookUrl("/api/webhooks/46elks/hangup");
}

/** Ring the owner's phone; on no answer/busy, the after-connect webhook decides (voicemail). */
export function connectAction(ownerNumber: string): ElksCallAction {
  return {
    connect: ownerNumber,
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
export function voicemailAction(kind: "VOICEMAIL" | "SCREEN"): ElksCallAction {
  const greeting =
    kind === "SCREEN"
      ? (optionalEnv("SCREEN_GREETING_URL") ?? optionalEnv("VOICE_GREETING_URL"))
      : optionalEnv("VOICE_GREETING_URL");
  const record: ElksCallAction = {
    record: webhookUrl("/api/webhooks/46elks/recording"),
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

/** Decline the call with a busy signal. */
export function rejectAction(): ElksCallAction {
  return { hangup: "reject" };
}
