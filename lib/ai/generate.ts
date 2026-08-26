import { generatePlainText, generateStructured, type TextResult } from "./client";
import { fastModel } from "./config";
import { evaluationSchema, type Evaluation } from "./schemas";
import { renderContext, contactDisplayName, type ContactContext } from "./context";
import type { AiUsage } from "./client";

const GENERATE_SYSTEM = `You write short personal SMS messages on behalf of the user,
addressed to one of their personal contacts. Write in the contact's preferred language
(default Swedish if unknown), matching the user's normal tone with this contact:
length, warmth, emoji usage, formality. Never sound like a company or a CRM.
Never invent facts, plans or commitments. Output ONLY the message text, nothing else.
Keep it within a normal SMS length (under 320 characters unless truly necessary).`;

/** Generate a message for a scheduled automation (birthday greeting, check-in...). */
export async function generateOutboundMessage(args: {
  ctx: ContactContext;
  purpose: string; // "birthday" | "checkin" | custom
  instruction?: string;
}): Promise<TextResult> {
  const name = contactDisplayName(args.ctx.contact);
  const purposeText =
    args.purpose === "birthday"
      ? `Today is ${name}'s birthday. Write a warm, personal birthday greeting.`
      : args.purpose === "name_day"
        ? `Today is ${name}'s name day. Write a short, warm and natural name-day greeting.`
      : args.purpose === "checkin"
        ? `Write a friendly, casual check-in message to ${name} — the user simply wants to stay in touch.`
        : `Write a short friendly SMS to ${name}. Purpose: ${args.purpose}.`;

  const prompt = `${renderContext(args.ctx)}

## Task
${purposeText}
${args.instruction ? `Additional instruction: ${args.instruction}` : ""}`;

  return generatePlainText({
    model: fastModel(),
    system: GENERATE_SYSTEM,
    prompt,
    purpose: `generate-${args.purpose}`,
  });
}

/** AI_EVALUATE action: should the user reach out to this contact right now? */
export async function evaluateRelationship(
  ctx: ContactContext,
): Promise<{ evaluation: Evaluation; usage: AiUsage }> {
  const prompt = `${renderContext(ctx)}

## Task
Evaluate whether the user should reach out to this contact now.
Consider the desired contact cadence (${ctx.contact.desiredContactCadenceDays ?? "unspecified"} days),
days since last interaction, open commitments, and upcoming dates.
Be conservative — only recommend outreach when there is a genuine reason.`;

  const result = await generateStructured({
    model: fastModel(),
    system:
      "You are a thoughtful assistant that helps a user maintain personal relationships. You return structured evaluations only.",
    prompt,
    schema: evaluationSchema,
    purpose: "evaluate-relationship",
  });
  return { evaluation: result.output, usage: result.usage };
}
