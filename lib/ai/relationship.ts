import { z } from "zod";
import { generateStructured, type AiUsage } from "./client";
import { fastModel } from "./config";
import type { ConfidenceEnvelope, RelationshipVector } from "@/lib/db/schema";

const dim = z.number().min(0).max(100);

export const relationshipVectorSchema = z.object({
  personalCloseness: dim,
  professionalRelevance: dim,
  formality: dim,
  trust: dim,
  humorTolerance: dim,
  sensitiveTopicAccess: dim,
  autonomousReplyFreedom: dim,
  proactiveContactDesired: dim,
  callThroughPriority: dim,
  privacySensitivity: dim,
});

const envelopeRule = z.enum(["AUTO", "ESCALATE", "BLOCK"]);

export const envelopeSchema = z.object({
  SMALL_TALK: envelopeRule,
  JOKES: envelopeRule,
  GENERIC_LIFE_QUESTIONS: envelopeRule,
  KNOWN_SHARED_TOPICS: envelopeRule,
  SUGGEST_MEETING: envelopeRule,
  AGREE_SPECIFIC_MEETING: envelopeRule,
  MONEY_OR_PAYMENT: envelopeRule,
  PRIVATE_INFORMATION: envelopeRule,
  FACTUAL_COMMITMENT: envelopeRule,
  WORK_DECISION: envelopeRule,
  CONFLICT_OR_EMOTION: envelopeRule,
});

export const relationshipProposalSchema = z.object({
  /** Short human label, e.g. "Nära vän · delvis professionell". */
  label: z.string(),
  vector: relationshipVectorSchema,
  suggestedEnvelope: envelopeSchema,
  reasoning: z.string(),
});

export type RelationshipProposal = z.infer<typeof relationshipProposalSchema>;

/**
 * The user describes the relationship in natural language; the AI proposes
 * the ontology (vector + label + confidence envelope). The user can then
 * fine-tune everything in Advanced relationship. "Colleague" and "friend"
 * can both be true at once — that is the point of the vector.
 */
export async function proposeRelationship(args: {
  contactName: string;
  description: string;
  preferredLanguage?: string | null;
}): Promise<{ proposal: RelationshipProposal; usage: AiUsage }> {
  const result = await generateStructured({
    model: fastModel(),
    system: `You convert a natural-language description of a personal relationship into a
structured relationship ontology for a personal phone assistant.

Vector dimensions are 0-100. Be conservative with autonomousReplyFreedom,
sensitiveTopicAccess and callThroughPriority — high values give the AI and
the phone more freedom. MONEY_OR_PAYMENT must be BLOCK unless the user's
description explicitly grants financial trust (and even then prefer ESCALATE).
AGREE_SPECIFIC_MEETING, FACTUAL_COMMITMENT, WORK_DECISION and
CONFLICT_OR_EMOTION should almost always be ESCALATE.
The label should be short, in the same language as the description
(e.g. "Nära vän · delvis professionell").`,
    prompt: `Contact: ${args.contactName}
The user describes the relationship as:
"${args.description}"`,
    schema: relationshipProposalSchema,
    purpose: "relationship-proposal",
  });
  return { proposal: result.output, usage: result.usage };
}

/** Default envelope when none is configured, derived from autonomy level. */
export function defaultEnvelope(autonomyLevel: number): Required<ConfidenceEnvelope> {
  const social = autonomyLevel >= 4 ? "AUTO" : "ESCALATE";
  return {
    SMALL_TALK: social,
    JOKES: social,
    GENERIC_LIFE_QUESTIONS: social,
    KNOWN_SHARED_TOPICS: social,
    SUGGEST_MEETING: "ESCALATE",
    AGREE_SPECIFIC_MEETING: "ESCALATE",
    MONEY_OR_PAYMENT: "BLOCK",
    PRIVATE_INFORMATION: "ESCALATE",
    FACTUAL_COMMITMENT: "ESCALATE",
    WORK_DECISION: "ESCALATE",
    CONFLICT_OR_EMOTION: "ESCALATE",
  };
}

/** Effective envelope = defaults overridden by explicit configuration. */
export function resolveEnvelope(
  autonomyLevel: number,
  configured: ConfidenceEnvelope | null | undefined,
): Required<ConfidenceEnvelope> {
  return { ...defaultEnvelope(autonomyLevel), ...(configured ?? {}) };
}

export function describeVector(vector: RelationshipVector | null | undefined): string[] {
  if (!vector) return [];
  const labels: Record<string, string> = {
    personalCloseness: "Personal closeness",
    professionalRelevance: "Professional relevance",
    formality: "Formality",
    trust: "Trust",
    humorTolerance: "Humor tolerance",
    sensitiveTopicAccess: "Sensitive-topic access",
    autonomousReplyFreedom: "Autonomous reply freedom",
    proactiveContactDesired: "Proactive contact desired",
    callThroughPriority: "Call-through priority",
    privacySensitivity: "Privacy sensitivity",
  };
  return Object.entries(vector)
    .filter(([, v]) => typeof v === "number")
    .map(([k, v]) => `${labels[k] ?? k}: ${v}`);
}
