import { z } from "zod";
import type { ModelMessage } from "ai";
import type { MediaAnalysis } from "@/lib/db/schema";
import type { ContactContext } from "./context";
import { renderContext } from "./context";
import { generateStructuredFromMessages, type AiUsage } from "./client";
import { optionalEnv } from "@/lib/env";

export const imageUnderstandingSchema = z.object({
  observation: z.object({
    caption: z.string(),
    objects: z.array(z.string()),
    visibleText: z.array(z.string()),
    peopleDescription: z.array(z.string()),
    sceneDescription: z.string(),
    safetyClassification: z.enum(["SAFE", "SENSITIVE", "UNSAFE"]),
  }),
  contextualInterpretation: z.string(),
  confidence: z.number().min(0).max(1),
});

export type ImageUnderstanding = z.infer<typeof imageUnderstandingSchema>;

/**
 * Analyze a sanitized image together with the current relationship and
 * conversation. The schema deliberately separates direct OBSERVATION from
 * contextual INTERPRETATION. The model is forbidden to infer make/model,
 * value, condition, identity or other facts not visible or in trusted text.
 */
export async function understandImage(args: {
  imageBase64: string;
  mimeType: string;
  messageText: string;
  context: ContactContext;
}): Promise<{
  analysis: MediaAnalysis;
  confidence: number;
  usage: AiUsage;
}> {
  const model =
    optionalEnv("AI_MODEL_VISION") ?? "google/gemini-3.7-flash";
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `${renderContext(args.context)}

## Current MMS text
${args.messageText ? `"${args.messageText}"` : "(no text)"}

Analyze the attached image.

OBSERVATION must contain only what is directly visible: a cautious caption,
generic objects, exact visible text, non-identifying people descriptions,
scene and safety. Never guess a car's exact model/engine/mileage/price,
a person's identity, a location, contractual meaning, medical condition, or
anything else not visibly supported.

CONTEXTUAL INTERPRETATION may connect the observation to the message and
recent trusted conversation, but must use uncertainty ("likely", "appears")
where appropriate. Do not turn interpretation into a factual claim.`,
        },
        {
          type: "file",
          mediaType: args.mimeType,
          data: args.imageBase64,
        },
      ],
    },
  ];

  const result = await generateStructuredFromMessages({
    model,
    system:
      "You are the vision layer of a cautious personal phone assistant. Separate observation from interpretation. Prefer uncertainty over hallucination.",
    messages,
    schema: imageUnderstandingSchema,
    purpose: "image-understanding",
  });
  const { observation, contextualInterpretation, confidence } = result.output;
  return {
    analysis: {
      ...observation,
      contextualInterpretation,
    },
    confidence,
    usage: result.usage,
  };
}

const imageCaptionReplySchema = z.object({
  message: z.string().min(1).max(500),
});

/** Draft owner-side MMS text that fits this exact relationship and image. */
export async function suggestImageMessage(args: {
  imageBase64: string;
  mimeType: string;
  context: ContactContext;
}): Promise<string> {
  const model =
    optionalEnv("AI_MODEL_VISION") ?? "google/gemini-3.7-flash";
  const result = await generateStructuredFromMessages({
    model,
    system:
      "Draft one natural personal message accompanying an image. Match how the owner writes to this contact. Never invent image facts. Return only structured output.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `${renderContext(args.context)}

Write a short MMS message from the owner to this contact about/accompanying
the attached image. Be grounded in what is visible. Do not infer make/model,
price, identity, location, history or condition. Keep the relationship's
usual language, length, humor and emoji style.`,
          },
          {
            type: "file",
            mediaType: args.mimeType,
            data: args.imageBase64,
          },
        ],
      },
    ],
    schema: imageCaptionReplySchema,
    purpose: "image-message-draft",
  });
  return result.output.message;
}
