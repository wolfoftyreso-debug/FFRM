import { z } from "zod";
import type { ModelMessage } from "ai";
import { generateStructuredFromMessages, type AiUsage } from "./client";
import { smartModel } from "./config";
import type { CommunicationProfile } from "@/lib/db/schema";

const ratio = z.number().min(0).max(1);

const styleProfileSchema = z.object({
  language: z.string(),
  formality: ratio,
  averageLength: z.enum(["very_short", "short", "medium", "long"]),
  humor: ratio,
  sarcasm: ratio,
  emojiFrequency: ratio,
  emojiTypes: z.array(z.string()),
  swearing: ratio,
  questionStyle: z.string(),
  greetingStyle: z.string(),
  signOffStyle: z.string(),
  usesNames: z.boolean(),
});

export const communicationProfileSchema = z.object({
  ownerStyle: styleProfileSchema,
  contactStyle: styleProfileSchema,
  commonTopics: z.array(z.string()),
  avoidedTopics: z.array(z.string()),
  recurringExpressions: z.array(z.string()),
  whoUsuallyInitiates: z.enum(["OWNER", "CONTACT", "BALANCED"]),
  notes: z.string(),
});

/**
 * "Teach AI how we talk": extract STYLE (not content) from uploaded
 * conversation screenshots via a multimodal Gateway model. The screenshots
 * are stored separately as provenance; only this structured profile is used
 * at message-generation time — never the raw images.
 */
export async function extractCommunicationProfile(args: {
  contactName: string;
  ownerName: string;
  images: { mimeType: string; base64: string }[];
}): Promise<{ profile: CommunicationProfile; usage: AiUsage }> {
  if (args.images.length === 0) throw new Error("No images provided");

  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        {
          type: "text",
          text: `These are screenshots of SMS/message conversations between the owner ("${args.ownerName}", typically the right-hand/outgoing side) and the contact "${args.contactName}" (typically the left-hand/incoming side).

Analyze the COMMUNICATION STYLE. Critically: distinguish how the OWNER writes to the contact (ownerStyle) from how the CONTACT writes to the owner (contactStyle). Note typical length, formality, humor, sarcasm, emoji usage and types, swearing, greetings/sign-offs, use of names, question style, recurring expressions, common topics and anything the owner appears to avoid.`,
        },
        ...args.images.map((img) => ({
          type: "file" as const,
          mediaType: img.mimeType,
          data: img.base64,
        })),
      ],
    },
  ];

  const result = await generateStructuredFromMessages({
    model: smartModel(),
    system:
      "You are an expert at analysing personal communication style from message screenshots. Extract style patterns, not private content. Be precise and conservative.",
    messages,
    schema: communicationProfileSchema,
    purpose: "style-extraction",
  });

  return { profile: result.output, usage: result.usage };
}
