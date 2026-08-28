import { z } from "zod";

export const envelopeCategorySchema = z.enum([
  "SMALL_TALK",
  "JOKES",
  "GENERIC_LIFE_QUESTIONS",
  "KNOWN_SHARED_TOPICS",
  "SUGGEST_MEETING",
  "AGREE_SPECIFIC_MEETING",
  "MONEY_OR_PAYMENT",
  "PRIVATE_INFORMATION",
  "FACTUAL_COMMITMENT",
  "WORK_DECISION",
  "CONFLICT_OR_EMOTION",
]);

/** Structured triage decision for an inbound message. */
export const triageDecisionSchema = z.object({
  decision: z.enum(["AUTO_REPLY", "ESCALATE", "IGNORE"]),
  confidence: z.number().min(0).max(1),
  risk: z.enum(["LOW", "MEDIUM", "HIGH"]),
  /** Which confidence-envelope category the message falls into. */
  policyMatch: envelopeCategorySchema,
  reason: z.string(),
  reply: z.string().nullable(),
  requiresUser: z.boolean(),
});

export type TriageDecision = z.infer<typeof triageDecisionSchema>;

/** Memory + commitment extraction from a conversation snippet. */
export const extractionSchema = z.object({
  facts: z.array(
    z.object({
      type: z.enum(["LIFE_EVENT", "PREFERENCE", "FAMILY", "WORK", "OTHER"]),
      fact: z.string(),
      date: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  commitments: z.array(
    z.object({
      description: z.string(),
      madeBy: z.enum(["USER", "CONTACT"]),
      dueAt: z.string().nullable(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export type Extraction = z.infer<typeof extractionSchema>;

/** AI relationship evaluation (AI_EVALUATE action). */
export const evaluationSchema = z.object({
  shouldReachOut: z.boolean(),
  reason: z.string(),
  suggestion: z.string().nullable(),
});

export type Evaluation = z.infer<typeof evaluationSchema>;
