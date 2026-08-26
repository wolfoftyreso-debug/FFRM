import { generateStructured, type AiUsage } from "./client";
import {
  fastModel,
  smartModel,
  TRIAGE_SMART_FALLBACK_THRESHOLD,
} from "./config";
import { triageDecisionSchema, type TriageDecision } from "./schemas";
import { ESCALATION_TOPICS } from "./policy";
import { renderContext, type ContactContext } from "./context";

const TRIAGE_SYSTEM = `You triage incoming SMS messages for a personal relationship assistant.
The assistant may ONLY auto-reply to trivially safe, low-risk social messages:
thanks, simple acknowledgements, friendly greetings, congratulations acknowledgements,
basic pleasantries, obvious conversational closures, simple emoji-like responses.

You MUST escalate (decision=ESCALATE, requiresUser=true, reply=null) whenever the message involves:
${ESCALATION_TOPICS.map((t) => `- ${t}`).join("\n")}

Also escalate whenever you are not highly confident. NEVER fabricate facts,
availability, opinions or commitments on behalf of the user. Prefer escalation
over fabrication, always.

If you auto-reply: write the reply in the language of the incoming message
(or the contact's preferred language), matching how the user normally writes
to this particular contact — tone, length, emoji usage. Keep it short and natural,
never generic CRM language.

decision=IGNORE only for messages that clearly need no response (e.g. delivery
notifications, "ok" that closes a conversation).`;

export interface TriageOutcome {
  decision: TriageDecision;
  model: string;
  usage: AiUsage;
  escalatedToSmartModel: boolean;
}

/**
 * Two-tier triage: the fast model classifies first; ambiguous AUTO_REPLY
 * decisions (below the confidence threshold) are re-evaluated by the smart
 * model. ESCALATE decisions are accepted from the fast model directly —
 * escalation is always the safe outcome.
 */
export async function triageInboundMessage(
  ctx: ContactContext,
  incomingText: string,
): Promise<TriageOutcome> {
  const prompt = `${renderContext(ctx)}

## Incoming SMS to triage
"${incomingText}"

Classify this message and decide: AUTO_REPLY, ESCALATE, or IGNORE.`;

  const fast = await generateStructured({
    model: fastModel(),
    system: TRIAGE_SYSTEM,
    prompt,
    schema: triageDecisionSchema,
    purpose: "triage-fast",
  });

  const needsSmart =
    fast.output.decision === "AUTO_REPLY" &&
    fast.output.confidence < TRIAGE_SMART_FALLBACK_THRESHOLD;

  if (!needsSmart) {
    return {
      decision: fast.output,
      model: fastModel(),
      usage: fast.usage,
      escalatedToSmartModel: false,
    };
  }

  const smart = await generateStructured({
    model: smartModel(),
    system: TRIAGE_SYSTEM,
    prompt,
    schema: triageDecisionSchema,
    purpose: "triage-smart",
  });

  return {
    decision: smart.output,
    model: smartModel(),
    usage: smart.usage,
    escalatedToSmartModel: true,
  };
}
