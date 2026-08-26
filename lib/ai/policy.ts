import type { TriageDecision } from "./schemas";

/**
 * Autonomy levels:
 * 0 = MEMORY_ONLY           — AI never acts, only remembers.
 * 1 = REMIND                — AI may create reminders for the user.
 * 2 = DRAFT                 — AI may draft messages; user sends manually.
 * 3 = APPROVAL              — AI drafts and queues; user approves sending.
 * 4 = AUTONOMOUS_LOW_RISK   — AI may send predefined low-risk messages itself.
 */
export const AUTONOMY = {
  MEMORY_ONLY: 0,
  REMIND: 1,
  DRAFT: 2,
  APPROVAL: 3,
  AUTONOMOUS_LOW_RISK: 4,
} as const;

export const AUTONOMY_LABELS: Record<number, string> = {
  0: "Memory only",
  1: "Remind me",
  2: "Draft for me",
  3: "Send after my approval",
  4: "Send low-risk automatically",
};

/** Topics that must always escalate, enforced in the triage prompt AND here. */
export const ESCALATION_TOPICS = [
  "money, loans, payments, investments",
  "contracts or legal matters",
  "medical matters",
  "emergencies or emotional crises",
  "relationship conflicts or romantic matters",
  "secrets or confidential information",
  "major personal decisions",
  "travel commitments",
  "promises or commitments on behalf of the user",
  "scheduling that requires the user's availability",
  "factual information the AI cannot know",
  "identity, authentication, addresses, security details",
];

export const MIN_AUTO_REPLY_CONFIDENCE = 0.85;

export interface AutoReplyPolicyInput {
  decision: TriageDecision;
  contactAutonomyLevel: number;
  conversationState: string; // AI | USER | PAUSED | ESCALATED
}

export interface PolicyVerdict {
  allowed: boolean;
  reason: string;
}

/**
 * Final gate before an AI-generated reply is sent. The model proposes; this
 * policy disposes. Prefers escalation over any doubt.
 */
export function canAutoReply(input: AutoReplyPolicyInput): PolicyVerdict {
  const { decision, contactAutonomyLevel, conversationState } = input;

  if (conversationState !== "AI") {
    return {
      allowed: false,
      reason: `Conversation is in ${conversationState} state; AI must not respond`,
    };
  }
  if (contactAutonomyLevel < AUTONOMY.AUTONOMOUS_LOW_RISK) {
    return {
      allowed: false,
      reason: `Contact autonomy level ${contactAutonomyLevel} does not permit autonomous replies`,
    };
  }
  if (decision.decision !== "AUTO_REPLY") {
    return { allowed: false, reason: `Decision is ${decision.decision}` };
  }
  if (decision.requiresUser) {
    return { allowed: false, reason: "Decision flags that the user is required" };
  }
  if (decision.risk !== "LOW") {
    return { allowed: false, reason: `Risk is ${decision.risk}, only LOW may auto-reply` };
  }
  if (decision.confidence < MIN_AUTO_REPLY_CONFIDENCE) {
    return {
      allowed: false,
      reason: `Confidence ${decision.confidence} below threshold ${MIN_AUTO_REPLY_CONFIDENCE}`,
    };
  }
  if (!decision.reply || !decision.reply.trim()) {
    return { allowed: false, reason: "No reply text produced" };
  }
  return { allowed: true, reason: "Low-risk auto-reply permitted by policy" };
}

/** May the automation engine send an AI-generated scheduled message without approval? */
export function canSendAutomatically(autonomyLevel: number): boolean {
  return autonomyLevel >= AUTONOMY.AUTONOMOUS_LOW_RISK;
}

/** Should a generated message be queued as a draft for approval instead? */
export function shouldDraft(autonomyLevel: number): boolean {
  return (
    autonomyLevel === AUTONOMY.DRAFT || autonomyLevel === AUTONOMY.APPROVAL
  );
}
