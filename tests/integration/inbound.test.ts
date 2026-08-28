import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  createTestDb,
  seedOwner,
  seedContact,
  installMockProvider,
  installMockAi,
  uninstallMocks,
  lowRiskAutoReply,
  defaultEscalate,
  type MockMessagingProvider,
} from "./helpers";
import * as schema from "@/lib/db/schema";
import type { Db } from "@/lib/db";
import { processInboundMessage } from "@/lib/inbound";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { eq } from "drizzle-orm";

let db: Db;
let provider: MockMessagingProvider;

async function insertInbound(
  contactId: string | null,
  conversationId: string,
  text: string,
  providerMessageId = `sIN${Math.random().toString(36).slice(2)}`,
) {
  const [message] = await db
    .insert(schema.messages)
    .values({
      conversationId,
      contactId,
      direction: "INBOUND",
      provider: "46elks",
      providerMessageId,
      fromNumber: "+46700000001",
      toNumber: "+46766861234",
      text,
      status: "RECEIVED",
    })
    .returning();
  return message;
}

describe("inbound AI conversation loop", () => {
  beforeEach(async () => {
    db = await createTestDb();
    provider = installMockProvider();
  });
  afterEach(() => uninstallMocks());

  it("auto-replies to low-risk messages at autonomy 4", async () => {
    installMockAi({ triage: lowRiskAutoReply });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const message = await insertInbound(contact.id, conversationId, "Tack så mycket!");

    await processInboundMessage(message.id);

    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0].text).toBe("Tack, detsamma! 😊");
    expect(provider.sent[0].to).toBe("+46700000001");

    const outbound = (await db.select().from(schema.messages)).filter(
      (m) => m.direction === "OUTBOUND",
    );
    expect(outbound).toHaveLength(1);
    expect(outbound[0].sender).toBe("AI");

    const [conv] = await db.select().from(schema.conversations);
    expect(conv.aiControlState).toBe("AI"); // still AI-handled
  });

  it("escalates risky messages, notifies the owner once, and never fabricates", async () => {
    installMockAi({ triage: defaultEscalate });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const message = await insertInbound(
      contact.id,
      conversationId,
      "Ska vi ses på torsdag kl 19?",
    );

    await processInboundMessage(message.id);

    // No reply to the contact.
    const toContact = provider.sent.filter((s) => s.to === "+46700000001");
    expect(toContact).toHaveLength(0);
    // Owner notified.
    const toOwner = provider.sent.filter((s) => s.to === "+46700000099");
    expect(toOwner).toHaveLength(1);
    expect(toOwner[0].text).toContain("behöver dig");
    // Message content NOT included by default (preview disabled).
    expect(toOwner[0].text).not.toContain("torsdag");

    const [conv] = await db.select().from(schema.conversations);
    expect(conv.aiControlState).toBe("ESCALATED");
    expect(conv.escalationNotifiedAt).not.toBeNull();

    // A second escalated message does not re-notify the owner.
    const message2 = await insertInbound(
      contact.id,
      conversationId,
      "Hallå? Svara!",
      "sIN2",
    );
    await processInboundMessage(message2.id);
    expect(provider.sent.filter((s) => s.to === "+46700000099")).toHaveLength(1);
  });

  it("escalates instead of auto-replying below autonomy 4", async () => {
    installMockAi({ triage: lowRiskAutoReply });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 1 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const message = await insertInbound(contact.id, conversationId, "Tack!");
    await processInboundMessage(message.id);

    expect(provider.sent.filter((s) => s.to === "+46700000001")).toHaveLength(0);
    const [conv] = await db.select().from(schema.conversations);
    expect(conv.aiControlState).toBe("ESCALATED");
  });

  it("stays silent when the user has taken over", async () => {
    const ai = installMockAi({ triage: lowRiskAutoReply });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    await db
      .update(schema.conversations)
      .set({ aiControlState: "USER" })
      .where(eq(schema.conversations.id, conversationId));

    const message = await insertInbound(contact.id, conversationId, "Tack!");
    await processInboundMessage(message.id);

    expect(provider.sent).toHaveLength(0);
    expect(ai.structuredCalls.filter((p) => p.startsWith("triage"))).toHaveLength(0);
  });

  it("claims processing exactly once (webhook retry safety)", async () => {
    installMockAi({ triage: lowRiskAutoReply });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const message = await insertInbound(contact.id, conversationId, "Tack!");

    await Promise.all([
      processInboundMessage(message.id),
      processInboundMessage(message.id),
      processInboundMessage(message.id),
    ]);

    expect(provider.sent).toHaveLength(1); // exactly one AI reply
  });

  it("escalates when AI triage fails (never lose communication)", async () => {
    installMockAi({ failStructured: true });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const message = await insertInbound(contact.id, conversationId, "Hej!");
    await processInboundMessage(message.id);

    const [conv] = await db.select().from(schema.conversations);
    expect(conv.aiControlState).toBe("ESCALATED");
    // No reply was sent to the contact.
    expect(provider.sent.filter((s) => s.to === "+46700000001")).toHaveLength(0);
  });

  it("stores extracted memories as suggestions with provenance", async () => {
    installMockAi({
      triage: lowRiskAutoReply,
      extraction: {
        facts: [
          {
            type: "LIFE_EVENT",
            fact: "Travelling to Spain",
            date: "2026-09-12",
            confidence: 0.89,
          },
        ],
        commitments: [
          {
            description: "User will call next week",
            madeBy: "USER",
            dueAt: null,
            confidence: 0.85,
          },
        ],
      },
    });
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, { autonomyLevel: 4 });
    const conversationId = await getOrCreateConversation(
      contact.id,
      contact.phoneNumber!,
    );
    const message = await insertInbound(
      contact.id,
      conversationId,
      "Vi åker till Spanien den 12 september. Jag ringer dig nästa vecka!",
    );
    await processInboundMessage(message.id);

    const facts = await db.select().from(schema.contactFacts);
    expect(facts).toHaveLength(1);
    expect(facts[0].status).toBe("SUGGESTED");
    expect(facts[0].createdBy).toBe("AI");
    expect(facts[0].sourceMessageId).toBe(message.id);

    const commitments = await db.select().from(schema.commitments);
    expect(commitments).toHaveLength(1);
    expect(commitments[0].status).toBe("SUGGESTED");
  });
});
