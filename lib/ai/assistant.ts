import { generateText, tool, stepCountIs } from "ai";
import { z } from "zod";
import { format } from "date-fns";
import { getDb } from "@/lib/db";
import {
  assistantMessages,
  calls,
  commitments,
  contacts,
  reminders,
} from "@/lib/db/schema";
import { and, asc, desc, eq, lte, sql } from "drizzle-orm";
import { smartModel } from "./config";
import { getSystemState } from "@/lib/system-state";
import { listConversations, displayName, getCalendarItems } from "@/lib/queries";
import { logActivity } from "@/lib/activity";
import { touchSystemState } from "@/lib/system-state";
import { aiCalls } from "@/lib/db/schema";

const ASSISTANT_SYSTEM = `You are the owner's personal relationship assistant inside their
AI-native phone system. You have tools to look up contacts, conversations,
calls, birthdays, reminders and commitments. Use them — never guess.

Answer in the language the owner writes in (Swedish by default).
Be concise and concrete. When you reference a person, use their name.
You may create reminders when asked. You cannot send messages or make calls
yourself — direct the owner to the conversation or phone view for that.
Today's date: {today}.`;

function tools() {
  return {
    search_contacts: tool({
      description:
        "Search contacts by name, nickname, phone number or email. Returns profile basics and last interaction.",
      inputSchema: z.object({ query: z.string() }),
      execute: async ({ query }) => {
        const db = await getDb();
        const all = await db
          .select()
          .from(contacts)
          .where(sql`${contacts.archivedAt} is null`);
        const q = query.toLowerCase();
        return all
          .filter((c) =>
            [c.firstName, c.lastName, c.displayName, c.nickname, c.phoneNumber, c.email]
              .filter(Boolean)
              .some((v) => v!.toLowerCase().includes(q)),
          )
          .slice(0, 8)
          .map((c) => ({
            id: c.id,
            name: displayName(c),
            relationship: c.relationshipLabel ?? c.relationshipType,
            phone: c.phoneNumber,
            birthday: c.birthday,
            lastInteractionAt: c.lastInteractionAt?.toISOString() ?? null,
            notes: c.notes,
          }));
      },
    }),
    who_needs_attention: tool({
      description:
        "List everything currently needing the owner's attention: escalated conversations, pending drafts, due reminders and overdue-contact cadences.",
      inputSchema: z.object({}),
      execute: async () => {
        const db = await getDb();
        const convs = (await listConversations()).filter(
          (c) => c.aiControlState === "ESCALATED" && c.status === "OPEN",
        );
        const dueReminders = await db
          .select()
          .from(reminders)
          .where(and(eq(reminders.status, "PENDING"), lte(reminders.dueAt, new Date())))
          .limit(15);
        const overdue = (
          await db.select().from(contacts).where(sql`${contacts.archivedAt} is null`)
        ).filter(
          (c) =>
            c.desiredContactCadenceDays &&
            (!c.lastInteractionAt ||
              Date.now() - c.lastInteractionAt.getTime() >
                c.desiredContactCadenceDays * 86400000),
        );
        return {
          escalatedConversations: convs.map((c) => ({
            contact: c.contactName,
            reason: c.escalationReason,
          })),
          dueReminders: dueReminders.map((r) => ({
            title: r.title,
            kind: r.kind,
            dueAt: r.dueAt?.toISOString(),
          })),
          contactsOverdue: overdue.map((c) => ({
            name: displayName(c),
            daysSinceContact: c.lastInteractionAt
              ? Math.floor((Date.now() - c.lastInteractionAt.getTime()) / 86400000)
              : null,
            desiredCadenceDays: c.desiredContactCadenceDays,
          })),
        };
      },
    }),
    upcoming_events: tool({
      description:
        "Upcoming calendar items (birthdays, scheduled automations, reminders, commitments) within N days.",
      inputSchema: z.object({ days: z.number().min(1).max(365).default(14) }),
      execute: async ({ days }) => {
        const items = await getCalendarItems(
          new Date(),
          new Date(Date.now() + days * 86400000),
        );
        return items.slice(0, 20).map((i) => ({
          at: format(i.at, "yyyy-MM-dd HH:mm"),
          title: i.title,
          kind: i.kind,
          contact: i.contactName,
        }));
      },
    }),
    recent_calls: tool({
      description: "Recent phone calls with state, AI summaries and transcripts.",
      inputSchema: z.object({ limit: z.number().min(1).max(30).default(10) }),
      execute: async ({ limit }) => {
        const db = await getDb();
        const rows = await db
          .select({ call: calls, contact: contacts })
          .from(calls)
          .leftJoin(contacts, eq(calls.contactId, contacts.id))
          .orderBy(desc(calls.createdAt))
          .limit(limit);
        return rows.map(({ call, contact }) => ({
          at: format(call.createdAt, "yyyy-MM-dd HH:mm"),
          who: contact ? displayName(contact) : call.fromNumber,
          direction: call.direction,
          state: call.state,
          durationSeconds: call.durationSeconds,
          summary: call.aiSummary,
          requiresUser: call.aiRequiresUser,
        }));
      },
    }),
    open_commitments: tool({
      description: "Open (confirmed or suggested) promises/commitments.",
      inputSchema: z.object({}),
      execute: async () => {
        const db = await getDb();
        const rows = await db
          .select({ commitment: commitments, contact: contacts })
          .from(commitments)
          .innerJoin(contacts, eq(commitments.contactId, contacts.id))
          .where(
            sql`${commitments.status} in ('SUGGESTED','CONFIRMED')`,
          )
          .orderBy(asc(commitments.dueAt))
          .limit(20);
        return rows.map(({ commitment, contact }) => ({
          contact: displayName(contact),
          madeBy: commitment.madeBy,
          description: commitment.description,
          dueAt: commitment.dueAt?.toISOString() ?? null,
          status: commitment.status,
        }));
      },
    }),
    conversation_history: tool({
      description:
        "Recent messages exchanged with a contact (by contact id from search_contacts).",
      inputSchema: z.object({ contactId: z.string(), limit: z.number().max(30).default(15) }),
      execute: async ({ contactId, limit }) => {
        const db = await getDb();
        const { messages } = await import("@/lib/db/schema");
        const rows = await db
          .select()
          .from(messages)
          .where(eq(messages.contactId, contactId))
          .orderBy(desc(messages.createdAt))
          .limit(limit);
        return rows.reverse().map((m) => ({
          at: format(m.createdAt, "yyyy-MM-dd HH:mm"),
          direction: m.direction,
          sender: m.sender,
          text: m.text,
        }));
      },
    }),
    create_reminder: tool({
      description:
        "Create a reminder for the owner. Optionally tie it to a contact (id from search_contacts) and a due datetime (ISO).",
      inputSchema: z.object({
        title: z.string(),
        contactId: z.string().nullable(),
        dueAt: z.string().nullable(),
      }),
      execute: async ({ title, contactId, dueAt }) => {
        const db = await getDb();
        const [created] = await db
          .insert(reminders)
          .values({
            contactId: contactId ?? null,
            kind: "REMINDER",
            title,
            dueAt: dueAt ? new Date(dueAt) : new Date(),
          })
          .returning();
        await logActivity({
          actor: "AI",
          action: "REMINDER_CREATED",
          summary: `Assistant created reminder: ${title}`,
          contactId: contactId ?? null,
          entityType: "reminder",
          entityId: created.id,
        });
        return { ok: true, id: created.id };
      },
    }),
    system_health: tool({
      description: "Operational heartbeats: last cron run, webhook, AI call, SMS sent.",
      inputSchema: z.object({}),
      execute: async () => getSystemState(),
    }),
  };
}

/**
 * One assistant turn: stores the user message, runs a tool loop against the
 * smart model, stores and returns the reply.
 */
export async function runAssistantTurn(userText: string): Promise<string> {
  const db = await getDb();
  await db.insert(assistantMessages).values({ role: "user", content: userText });

  const history = await db
    .select()
    .from(assistantMessages)
    .orderBy(desc(assistantMessages.createdAt))
    .limit(20);

  const started = Date.now();
  const model = smartModel();
  try {
    const result = await generateText({
      model,
      system: ASSISTANT_SYSTEM.replace(
        "{today}",
        format(new Date(), "yyyy-MM-dd (EEEE)"),
      ),
      messages: history.reverse().map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: tools(),
      stopWhen: stepCountIs(6),
    });

    await db.insert(aiCalls).values({
      purpose: "assistant-chat",
      model,
      inputTokens: result.usage.inputTokens ?? null,
      outputTokens: result.usage.outputTokens ?? null,
      durationMs: Date.now() - started,
      ok: true,
    });
    await touchSystemState("lastAiAt");

    const reply = result.text.trim() || "…";
    await db.insert(assistantMessages).values({ role: "assistant", content: reply });
    return reply;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(aiCalls).values({
      purpose: "assistant-chat",
      model,
      durationMs: Date.now() - started,
      ok: false,
      error: message,
    });
    const fallback = `Assistenten kunde inte svara just nu (${message.slice(0, 120)}).`;
    await db
      .insert(assistantMessages)
      .values({ role: "assistant", content: fallback });
    return fallback;
  }
}
