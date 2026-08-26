import "server-only";

import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  contacts,
  users,
  type Contact,
  type User,
} from "@/lib/db/schema";
import { createId } from "@/lib/id";

export interface ContactCardData {
  name: string;
  firstName: string;
  lastName: string | null;
  nickname?: string | null;
  phoneNumber: string | null;
  email: string | null;
  birthday?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  photoDataBase64: string | null;
  photoMimeType: string | null;
  companyLogoDataBase64?: string | null;
  companyLogoMimeType?: string | null;
}

export interface SharedContact extends ContactCardData {
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

export async function getContactCard(
  id: string,
): Promise<ContactCardData | null> {
  const db = await getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  return contact ? contactCard(contact) : null;
}

export function buildVCard(contact: ContactCardData): string {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${escapeVCard(contact.name)}`,
    `N:${escapeVCard(contact.lastName ?? "")};${escapeVCard(
      contact.firstName,
    )};;;`,
  ];
  if (contact.nickname) {
    lines.push(`NICKNAME:${escapeVCard(contact.nickname)}`);
  }
  if (contact.phoneNumber) {
    lines.push(`TEL;TYPE=CELL:${escapeVCard(contact.phoneNumber)}`);
  }
  if (contact.email) {
    lines.push(`EMAIL;TYPE=INTERNET:${escapeVCard(contact.email)}`);
  }
  if (contact.birthday) lines.push(`BDAY:${contact.birthday}`);
  if (contact.company) lines.push(`ORG:${escapeVCard(contact.company)}`);
  if (contact.jobTitle) lines.push(`TITLE:${escapeVCard(contact.jobTitle)}`);
  if (contact.photoDataBase64 && contact.photoMimeType) {
    const imageType = contact.photoMimeType.split("/")[1]?.toUpperCase() || "JPEG";
    lines.push(
      `PHOTO;ENCODING=b;TYPE=${imageType}:${contact.photoDataBase64}`,
    );
  }
  if (contact.companyLogoDataBase64 && contact.companyLogoMimeType) {
    const imageType =
      contact.companyLogoMimeType.split("/")[1]?.toUpperCase() || "PNG";
    lines.push(
      `LOGO;ENCODING=b;TYPE=${imageType}:${contact.companyLogoDataBase64}`,
    );
  }
  lines.push("END:VCARD");
  return `${lines.map(foldVCardLine).join("\r\n")}\r\n`;
}

function sharedContact(owner: User, shareToken: string): SharedContact {
  const [firstName, ...rest] = owner.name.trim().split(/\s+/);
  return {
    name: owner.name,
    firstName: firstName || owner.name,
    lastName: rest.join(" ") || null,
    phoneNumber: owner.phoneNumber,
    email: owner.email,
    company: owner.company,
    jobTitle: owner.jobTitle,
    photoDataBase64: owner.photoDataBase64,
    photoMimeType: owner.photoMimeType,
    companyLogoDataBase64: owner.companyLogoDataBase64,
    companyLogoMimeType: owner.companyLogoMimeType,
    shareToken,
  };
}

function contactCard(contact: Contact): ContactCardData {
  return {
    name:
      contact.displayName ||
      [contact.firstName, contact.lastName].filter(Boolean).join(" "),
    firstName: contact.firstName,
    lastName: contact.lastName,
    nickname: contact.nickname,
    phoneNumber: contact.phoneNumber,
    email: contact.email,
    birthday: contact.birthday,
    company: contact.profile?.company ?? null,
    jobTitle: contact.profile?.jobTitle ?? null,
    photoDataBase64: contact.photoDataBase64,
    photoMimeType: contact.photoMimeType,
  };
}

function escapeVCard(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

/** RFC 6350 folding is also accepted by vCard 3 readers in iOS and Android. */
function foldVCardLine(line: string): string {
  const chunks: string[] = [];
  for (let offset = 0; offset < line.length; offset += 74) {
    chunks.push(line.slice(offset, offset + 74));
  }
  return chunks.join("\r\n ");
}
