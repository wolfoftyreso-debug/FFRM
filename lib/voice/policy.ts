import type {
  CallDisposition,
  Contact,
  GlobalCallPolicy,
} from "@/lib/db/schema";
import { utcToZonedParts, parseTimeOfDay } from "@/lib/time";
import { defaultTimezone } from "@/lib/env";

/**
 * Inbound call routing. The relationship ontology drives the phone:
 * global policy decides the default, per-contact settings override, and the
 * relationship vector's callThroughPriority can pierce the night rule.
 */

export const DEFAULT_GLOBAL_CALL_POLICY: Required<GlobalCallPolicy> = {
  knownContacts: "RING_THROUGH",
  unknownCallers: "SCREEN",
  nightStart: "22:00",
  nightEnd: "07:00",
  nightAction: "VOICEMAIL",
  nightPriorityThreshold: 85,
};

export interface CallRoutingDecision {
  disposition: CallDisposition | "REJECT";
  reason: string;
}

export interface CallRoutingInput {
  contact: Pick<
    Contact,
    "callPolicy" | "relationshipVector" | "timezone" | "firstName"
  > | null;
  isBlocked: boolean;
  globalPolicy: GlobalCallPolicy | null | undefined;
  now?: Date;
  timezone?: string;
}

export function isNight(
  now: Date,
  timezone: string,
  nightStart: string,
  nightEnd: string,
): boolean {
  const parts = utcToZonedParts(now, timezone);
  const minutes = parts.hour * 60 + parts.minute;
  const start = parseTimeOfDay(nightStart);
  const end = parseTimeOfDay(nightEnd);
  const startM = start.hour * 60 + start.minute;
  const endM = end.hour * 60 + end.minute;
  if (startM === endM) return false;
  // Window may wrap midnight (e.g. 22:00–07:00).
  return startM < endM
    ? minutes >= startM && minutes < endM
    : minutes >= startM || minutes < endM;
}

export function decideCallRouting(input: CallRoutingInput): CallRoutingDecision {
  const now = input.now ?? new Date();
  const tz = input.timezone ?? defaultTimezone();
  const policy = { ...DEFAULT_GLOBAL_CALL_POLICY, ...(input.globalPolicy ?? {}) };
  const night = isNight(now, tz, policy.nightStart, policy.nightEnd);

  if (input.isBlocked) {
    return { disposition: "REJECT", reason: "Number is blocked" };
  }

  const contact = input.contact;

  // Per-contact overrides win over everything except explicit blocks.
  if (contact && contact.callPolicy !== "INHERIT") {
    switch (contact.callPolicy) {
      case "BLOCK":
        return { disposition: "REJECT", reason: "Contact policy: blocked" };
      case "ALWAYS_RING_THROUGH":
        return {
          disposition: "RING_THROUGH",
          reason: "Contact policy: always ring through",
        };
      case "VOICEMAIL":
        return { disposition: "VOICEMAIL", reason: "Contact policy: voicemail" };
      case "SCREEN":
        return { disposition: "SCREEN", reason: "Contact policy: screening" };
      case "RING_THROUGH_DAYTIME":
        return night
          ? {
              disposition: policy.nightAction,
              reason: "Contact policy: daytime only — night window active",
            }
          : {
              disposition: "RING_THROUGH",
              reason: "Contact policy: ring through (daytime)",
            };
    }
  }

  // Global policy.
  let base: CallDisposition = contact
    ? policy.knownContacts
    : policy.unknownCallers;
  let reason = contact
    ? `Global policy for known contacts: ${policy.knownContacts}`
    : `Global policy for unknown callers: ${policy.unknownCallers}`;

  // Night rule downgrades ring-through unless the relationship's
  // call-through priority pierces it (inner circle).
  if (night && base === "RING_THROUGH") {
    const priority = contact?.relationshipVector?.callThroughPriority ?? 0;
    if (priority >= policy.nightPriorityThreshold) {
      reason = `Night window, but call-through priority ${priority} ≥ ${policy.nightPriorityThreshold}`;
    } else {
      base = policy.nightAction;
      reason = `Night window active → ${policy.nightAction}`;
    }
  }

  return { disposition: base, reason };
}
