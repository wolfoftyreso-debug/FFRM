import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createTestDb,
  seedContact,
  seedOwner,
  uninstallMocks,
} from "./helpers";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { getLiveVersion } from "@/lib/live";
import { listConversations } from "@/lib/queries";
import { getOrCreateConversation } from "@/lib/sms/send-message";
import { GET as liveEndpoint } from "@/app/api/live/route";

let db: Db;

async function inbound(conversationId: string, contactId: string, text: string) {
  const [message] = await db
    .insert(schema.messages)
    .values({
      conversationId,
      contactId,
      direction: "INBOUND",
      fromNumber: "+46700000001",
      toNumber: "+46766861234",
      text,
      status: "RECEIVED",
    })
    .returning();
  await db
    .update(schema.conversations)
    .set({ lastMessageAt: new Date() })
    .where(eq(schema.conversations.id, conversationId));
  return message;
}

describe("live version", () => {
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(() => uninstallMocks());

  it("is stable while nothing happens", async () => {
    const first = await getLiveVersion();
    expect(first).toBe(await getLiveVersion());
    expect(first.length).toBeGreaterThan(0);
  });

  it("changes when a message arrives", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(contact.id, null);
    const before = await getLiveVersion();

    await inbound(conversationId, contact.id, "Hej!");

    expect(await getLiveVersion()).not.toBe(before);
  });

  it("changes when a message only changes delivery state", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(contact.id, null);
    const message = await inbound(conversationId, contact.id, "Hej!");
    const before = await getLiveVersion();

    await db
      .update(schema.messages)
      .set({ status: "DELIVERED", deliveredAt: new Date() })
      .where(eq(schema.messages.id, message.id));

    expect(await getLiveVersion()).not.toBe(before);
  });

  it("changes when the AI escalates a conversation in place", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(contact.id, null);
    const before = await getLiveVersion();

    await db
      .update(schema.conversations)
      .set({ aiControlState: "ESCALATED", escalationReason: "Needs you" })
      .where(eq(schema.conversations.id, conversationId));

    expect(await getLiveVersion()).not.toBe(before);
  });

  it("changes when the thread is marked read", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(contact.id, null);
    await inbound(conversationId, contact.id, "Hej!");
    const before = await getLiveVersion();

    await db
      .update(schema.conversations)
      .set({ lastReadAt: new Date() })
      .where(eq(schema.conversations.id, conversationId));

    expect(await getLiveVersion()).not.toBe(before);
  });

  it("changes when a call is recorded and again when it is transcribed", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const before = await getLiveVersion();

    const [call] = await db
      .insert(schema.calls)
      .values({
        providerCallId: "cTEST1",
        contactId: contact.id,
        direction: "INBOUND",
        fromNumber: contact.phoneNumber!,
        toNumber: "+46766861234",
        state: "VOICEMAIL",
      })
      .returning();
    const recorded = await getLiveVersion();
    expect(recorded).not.toBe(before);

    await db
      .update(schema.calls)
      .set({ aiRequiresUser: true, aiSummary: "Ring tillbaka", processedAt: new Date() })
      .where(eq(schema.calls.id, call.id));

    expect(await getLiveVersion()).not.toBe(recorded);
  });

  it("changes when a pending reminder becomes due without any write", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    await db.insert(schema.reminders).values({
      contactId: contact.id,
      kind: "REMINDER",
      title: "Ring Johan",
      dueAt: new Date(Date.now() + 150),
      status: "PENDING",
    });
    const before = await getLiveVersion();

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(await getLiveVersion()).not.toBe(before);
    expect(owner.id).toBeTruthy();
  });

  it("is served by the change endpoint the client polls", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(contact.id, null);

    const first = await liveEndpoint();
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    const before = (await first.json()) as { version: string };
    expect(before.version).toBe(await getLiveVersion());

    await inbound(conversationId, contact.id, "Hej!");

    const after = (await (await liveEndpoint()).json()) as { version: string };
    expect(after.version).not.toBe(before.version);
  });
});

describe("inbox previews", () => {
  beforeEach(async () => {
    db = await createTestDb();
  });
  afterEach(() => uninstallMocks());

  it("shows each conversation its own newest message", async () => {
    const owner = await seedOwner(db);
    const johan = await seedContact(db, owner.id);
    const alice = await seedContact(db, owner.id, {
      firstName: "Alice",
      phoneNumber: "+46700000002",
    });
    const johanThread = await getOrCreateConversation(johan.id, null);
    const aliceThread = await getOrCreateConversation(alice.id, null);

    const at = (minutes: number) => new Date(Date.UTC(2026, 0, 1, 12, minutes));
    await db.insert(schema.messages).values([
      {
        conversationId: johanThread,
        contactId: johan.id,
        direction: "INBOUND",
        fromNumber: johan.phoneNumber!,
        toNumber: "+46766861234",
        text: "Johan first",
        status: "RECEIVED",
        createdAt: at(1),
      },
      {
        conversationId: johanThread,
        contactId: johan.id,
        direction: "INBOUND",
        fromNumber: johan.phoneNumber!,
        toNumber: "+46766861234",
        text: "Johan newest",
        status: "RECEIVED",
        createdAt: at(3),
      },
      {
        conversationId: aliceThread,
        contactId: alice.id,
        direction: "INBOUND",
        fromNumber: alice.phoneNumber!,
        toNumber: "+46766861234",
        text: "Alice newest",
        status: "RECEIVED",
        createdAt: at(2),
      },
    ]);
    await db
      .update(schema.conversations)
      .set({ lastMessageAt: at(3) })
      .where(eq(schema.conversations.id, johanThread));
    await db
      .update(schema.conversations)
      .set({ lastMessageAt: at(2) })
      .where(eq(schema.conversations.id, aliceThread));

    const inbox = await listConversations();

    expect(inbox.map((c) => c.lastMessageText)).toEqual([
      "Johan newest",
      "Alice newest",
    ]);
  });

  it("leaves a conversation without messages previewless", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    await getOrCreateConversation(contact.id, null);

    const [only] = await listConversations();

    expect(only.lastMessageText).toBeNull();
    expect(only.unread).toBe(false);
  });

  it("gives the inbox row a versioned photo URL only when a photo exists", async () => {
    const owner = await seedOwner(db);
    const withPhoto = await seedContact(db, owner.id, { firstName: "Foto" });
    const withoutPhoto = await seedContact(db, owner.id, {
      firstName: "Utan",
      phoneNumber: "+46700000003",
    });
    await db
      .update(schema.contacts)
      .set({
        photoDataBase64: Buffer.from("not-a-real-image").toString("base64"),
        photoMimeType: "image/jpeg",
      })
      .where(eq(schema.contacts.id, withPhoto.id));
    const photoThread = await getOrCreateConversation(withPhoto.id, null);
    const plainThread = await getOrCreateConversation(withoutPhoto.id, null);
    await inbound(photoThread, withPhoto.id, "Hej!");
    await inbound(plainThread, withoutPhoto.id, "Hej!");

    const inbox = await listConversations();
    const photoRow = inbox.find((c) => c.contactId === withPhoto.id);
    const plainRow = inbox.find((c) => c.contactId === withoutPhoto.id);

    expect(plainRow?.contactPhotoUrl).toBeNull();
    expect(photoRow?.contactPhotoUrl).toMatch(
      new RegExp(`^/api/contacts/${withPhoto.id}/photo\\?v=\\d+$`),
    );
  });

  it("changes the photo URL when the photo changes, so caches cannot go stale", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id);
    const conversationId = await getOrCreateConversation(contact.id, null);
    await inbound(conversationId, contact.id, "Hej!");
    await db
      .update(schema.contacts)
      .set({
        photoDataBase64: Buffer.from("first").toString("base64"),
        photoMimeType: "image/jpeg",
      })
      .where(eq(schema.contacts.id, contact.id));
    const before = (await listConversations())[0]?.contactPhotoUrl;

    await new Promise((resolve) => setTimeout(resolve, 20));
    await db
      .update(schema.contacts)
      .set({
        photoDataBase64: Buffer.from("second").toString("base64"),
        updatedAt: new Date(),
      })
      .where(eq(schema.contacts.id, contact.id));

    const after = (await listConversations())[0]?.contactPhotoUrl;
    expect(before).toBeTruthy();
    expect(after).not.toBe(before);
  });
});
