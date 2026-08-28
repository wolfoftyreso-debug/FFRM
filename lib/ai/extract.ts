import { getDb } from "@/lib/db";
import { commitments, contactFacts, type Contact } from "@/lib/db/schema";
import { generateStructured } from "./client";
import { fastModel } from "./config";
import { extractionSchema } from "./schemas";
import { logActivity } from "@/lib/activity";
import { contactDisplayName } from "./context";

const EXTRACT_SYSTEM = `You extract durable relationship memory from SMS conversations.
Extract only clearly stated facts (life events, preferences, family, work) and
explicit promises/commitments ("I'll call you next week", "we should meet after
the holidays"). Ignore small talk. Dates must be ISO (YYYY-MM-DD) or null.
Return empty arrays when nothing qualifies. Be conservative: when unsure, omit.`;

/**
 * Post-conversation memory extraction. Proposals are stored as SUGGESTED with
 * provenance (source message, confidence, createdBy=AI) — the user confirms
 * or dismisses them. Nothing is silently overwritten.
 */
export async function extractMemory(args: {
  contact: Contact;
  messageId: string;
  recentConversation: string;
}): Promise<{ facts: number; commitments: number }> {
  const db = await getDb();

  const result = await generateStructured({
    model: fastModel(),
    system: EXTRACT_SYSTEM,
    prompt: `Contact: ${contactDisplayName(args.contact)}

Conversation (oldest first):
${args.recentConversation}

Extract facts and commitments from the most recent messages.`,
    schema: extractionSchema,
    purpose: "extract-memory",
  });

  let factCount = 0;
  for (const f of result.output.facts) {
    if (f.confidence < 0.6) continue;
    await db.insert(contactFacts).values({
      contactId: args.contact.id,
      type: f.type,
      fact: f.fact,
      date: f.date,
      confidence: f.confidence,
      status: "SUGGESTED",
      createdBy: "AI",
      sourceMessageId: args.messageId,
    });
    factCount++;
  }

  let commitmentCount = 0;
  for (const c of result.output.commitments) {
    if (c.confidence < 0.6) continue;
    await db.insert(commitments).values({
      contactId: args.contact.id,
      description: c.description,
      madeBy: c.madeBy,
      dueAt: c.dueAt ? new Date(c.dueAt) : null,
      confidence: c.confidence,
      status: "SUGGESTED",
      sourceMessageId: args.messageId,
    });
    commitmentCount++;
  }

  if (factCount + commitmentCount > 0) {
    await logActivity({
      actor: "AI",
      action: "MEMORY_EXTRACTED",
      summary: `Extracted ${factCount} fact(s) and ${commitmentCount} commitment(s) from conversation`,
      contactId: args.contact.id,
      entityType: "message",
      entityId: args.messageId,
    });
  }

  return { facts: factCount, commitments: commitmentCount };
}
