import { NextResponse } from "next/server";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts, conversations, messages } from "@/lib/db/schema";
import { generatePlainText } from "@/lib/ai/client";
import { fastModel } from "@/lib/ai/config";

const inputSchema = z.object({
  conversationId: z.string().min(1),
  text: z.string().trim().min(1).max(2_000),
});

/** Corrects a rough draft without changing its intent or adding facts. */
export async function POST(req: Request) {
  try {
    const input = inputSchema.parse(await req.json());
    const db = await getDb();
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, input.conversationId))
      .limit(1);
    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }
    const [contact, recent] = await Promise.all([
      conversation.contactId
        ? db
            .select()
            .from(contacts)
            .where(eq(contacts.id, conversation.contactId))
            .limit(1)
            .then((rows) => rows[0] ?? null)
        : Promise.resolve(null),
      db
        .select({
          direction: messages.direction,
          sender: messages.sender,
          text: messages.text,
        })
        .from(messages)
        .where(eq(messages.conversationId, conversation.id))
        .orderBy(desc(messages.createdAt))
        .limit(8),
    ]);
    const history = recent
      .reverse()
      .map(
        (message) =>
          `${message.direction === "INBOUND" ? "Contact" : message.sender ?? "Owner"}: ${message.text}`,
      )
      .join("\n");
    const result = await generatePlainText({
      model: fastModel(),
      system:
        "Polish rough SMS drafts for the owner. Preserve the exact meaning, names, facts, commitments, dates, and language. Correct spelling and grammar and improve clarity while keeping the sender's natural tone. Never add information, promises, greetings, emojis, or sign-offs that were not implied. Return only the revised SMS.",
      prompt: `Contact style: ${contact?.communicationStyle ?? "unknown"}
Emoji style: ${contact?.emojiStyle ?? "unknown"}
Recent context:
${history || "(none)"}

Rough draft:
${input.text}`,
      purpose: "sms-polish",
    });
    return NextResponse.json({ text: result.text });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid text" }, { status: 400 });
    }
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not improve text",
      },
      { status: 500 },
    );
  }
}

