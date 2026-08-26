import { createHash } from "node:crypto";
import { and, asc, between, isNotNull, notInArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import {
  calls,
  conversationInsights,
  messages,
  type InsightSourceType,
} from "@/lib/db/schema";
import { fastModel } from "@/lib/ai/config";
import { generateStructured, type AiUsage } from "@/lib/ai/client";
import { touchSystemState } from "@/lib/system-state";

const insightBatchSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["DECISION", "NOTE"]),
      summary: z.string().min(1).max(500),
      quote: z.string().min(1).max(1_500),
      sourceRef: z.string().min(1),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

interface Source {
  id: string;
  type: InsightSourceType;
  contactId: string | null;
  conversationId: string | null;
  text: string;
  createdAt: Date;
}

export interface InsightSweepResult {
  groupsScanned: number;
  sourcesScanned: number;
  created: number;
  rejected: number;
  usage: AiUsage[];
}

/**
 * Reviews a bounded window of actual message/call text. Model output is only
 * accepted when its quote is a byte-for-byte substring of the selected source.
 */
export async function extractConversationInsights(args: {
  windowStart: Date;
  windowEnd: Date;
  executionId?: string;
  contactLimit?: number;
}): Promise<InsightSweepResult> {
  const db = await getDb();
  const [messageRows, callRows] = await Promise.all([
    db
      .select({
        id: messages.id,
        contactId: messages.contactId,
        conversationId: messages.conversationId,
        text: messages.text,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(
        and(
          between(messages.createdAt, args.windowStart, args.windowEnd),
          notInArray(messages.channel, ["SYSTEM", "AUTOMATION"]),
        ),
      )
      .orderBy(asc(messages.createdAt))
      .limit(500),
    db
      .select({
        id: calls.id,
        contactId: calls.contactId,
        conversationId: calls.conversationId,
        text: calls.transcript,
        createdAt: calls.createdAt,
      })
      .from(calls)
      .where(
        and(
          between(calls.createdAt, args.windowStart, args.windowEnd),
          isNotNull(calls.transcript),
        ),
      )
      .orderBy(asc(calls.createdAt))
      .limit(200),
  ]);

  const sources: Source[] = [
    ...messageRows
      .filter((row) => row.text.trim())
      .map((row) => ({ ...row, type: "MESSAGE" as const })),
    ...callRows
      .filter((row): row is typeof row & { text: string } => !!row.text?.trim())
      .map((row) => ({ ...row, type: "CALL" as const })),
  ].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const groups = new Map<string, Source[]>();
  for (const source of sources) {
    const key =
      source.contactId ??
      source.conversationId ??
      `${source.type}:${source.id}`;
    const group = groups.get(key) ?? [];
    group.push(source);
    groups.set(key, group);
  }

  let created = 0;
  let rejected = 0;
  let groupsScanned = 0;
  let sourcesScanned = 0;
  const usage: AiUsage[] = [];
  const limit = Math.max(1, Math.min(args.contactLimit ?? 30, 100));

  for (const group of [...groups.values()].slice(0, limit)) {
    const sourceByRef = new Map(
      group.map((source) => [sourceRef(source), source]),
    );
    const transcript = group
      .map(
        (source) =>
          `[${sourceRef(source)} ${source.createdAt.toISOString()}]\n${source.text.slice(0, 12_000)}`,
      )
      .join("\n\n");
    if (!transcript.trim()) continue;

    const generated = await generateStructured({
      model: fastModel(),
      system:
        "You review private phone transcripts for the owner. Return only durable facts worth remembering and decisions, promises, requests, or follow-ups that may need action. Every quote must be copied verbatim from exactly one labeled source. Never infer a quote, combine wording from sources, or create facts not present in the text. Ignore greetings, small talk, and duplicates.",
      prompt: `Review these sources. Use kind NOTE for durable information and DECISION for decisions, promises, requests, or follow-ups. sourceRef must exactly match a label such as MESSAGE:abc or CALL:def.\n\n${transcript}`,
      schema: insightBatchSchema,
      purpose: "twice-daily-insight-extraction",
    });
    usage.push(generated.usage);
    groupsScanned += 1;
    sourcesScanned += group.length;

    for (const item of generated.output.items) {
      const source = sourceByRef.get(item.sourceRef);
      const quote = item.quote.trim();
      if (
        !source ||
        item.confidence < 0.65 ||
        !quote ||
        !source.text.includes(quote)
      ) {
        rejected += 1;
        continue;
      }

      const inserted = await db
        .insert(conversationInsights)
        .values({
          contactId: source.contactId,
          conversationId: source.conversationId,
          kind: item.kind,
          summary: item.summary.trim(),
          quote,
          sourceType: source.type,
          sourceId: source.id,
          confidence: item.confidence,
          dedupeKey: insightDedupeKey(source, quote),
          extractionExecutionId: args.executionId ?? null,
        })
        .onConflictDoNothing()
        .returning({ id: conversationInsights.id });
      created += inserted.length;
    }
  }

  await touchSystemState("lastInsightSweepAt");
  return {
    groupsScanned,
    sourcesScanned,
    created,
    rejected,
    usage,
  };
}

function sourceRef(source: Source): string {
  return `${source.type}:${source.id}`;
}

function insightDedupeKey(source: Source, quote: string): string {
  const hash = createHash("sha256")
    .update(quote.trim().toLocaleLowerCase().replace(/\s+/g, " "))
    .digest("hex")
    .slice(0, 24);
  return `insight:${source.type}:${source.id}:${hash}`;
}

