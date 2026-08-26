import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users, type User } from "@/lib/db/schema";
import { createId } from "@/lib/id";

export interface SharedContact {
  name: string;
  phoneNumber: string | null;
  email: string | null;
  shareToken: string;
}

export async function getOrCreateOwnerShareProfile(): Promise<SharedContact | null> {
  const db = await getDb();
  const [owner] = await db.select().from(users).limit(1);
  if (!owner) return null;
  if (owner.shareToken) return sharedContact(owner, owner.shareToken);

  const shareToken = createId();
  const [updated] = await db
    .update(users)
    .set({ shareToken, updatedAt: sql`now()` })
    .where(eq(users.id, owner.id))
    .returning();
  return updated ? sharedContact(updated, shareToken) : null;
}

export async function getSharedContact(
  token: string,
): Promise<SharedContact | null> {
  if (!/^[a-z0-9]{12,64}$/.test(token)) return null;
  const db = await getDb();
  const [owner] = await db
    .select()
    .from(users)
    .where(eq(users.shareToken, token))
    .limit(1);
  return owner?.shareToken ? sharedContact(owner, owner.shareToken) : null;
}

export function buildVCard(contact: SharedContact): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(contact.name)}`,
    `N:${escapeVCard(contact.name)};;;;`,
  ];
  if (contact.phoneNumber) {
    lines.push(`TEL;TYPE=CELL:${escapeVCard(contact.phoneNumber)}`);
  }
  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(contact.email)}`);
  }
  lines.push("END:VCARD");
  return `${lines.join("\r\n")}\r\n`;
}

function sharedContact(owner: User, shareToken: string): SharedContact {
  return {
    name: owner.name,
    phoneNumber: owner.phoneNumber,
    email: owner.email,
    shareToken,
  };
}

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
