import { getDb } from "@/lib/db";
import {
  contactFacts,
  commitments,
  mediaAssets,
  messages,
  users,
  type Contact,
  type User,
} from "@/lib/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { differenceInCalendarDays, format } from "date-fns";

/**
 * Controlled context package for AI calls. Retrieves only what is relevant
 * for one contact — never the whole database.
 */
export interface ContactContext {
  user: User | null;
  contact: Contact;
  confirmedFacts: string[];
  openCommitments: string[];
  recentMessages: { direction: string; text: string; at: string }[];
  daysSinceLastInteraction: number | null;
}

export async function buildContactContext(
  contact: Contact,
  options: { conversationId?: string | null; messageLimit?: number } = {},
): Promise<ContactContext> {
  const db = await getDb();

  const [user] = await db.select().from(users).limit(1);

  const facts = await db
    .select()
    .from(contactFacts)
    .where(
      and(
        eq(contactFacts.contactId, contact.id),
        eq(contactFacts.status, "CONFIRMED"),
      ),
    )
    .orderBy(desc(contactFacts.createdAt))
    .limit(20);

  const openCommitments = await db
    .select()
    .from(commitments)
    .where(
      and(
        eq(commitments.contactId, contact.id),
        eq(commitments.status, "CONFIRMED"),
      ),
    )
    .limit(10);

  const recent = await db
    .select()
    .from(messages)
    .where(
      options.conversationId
        ? eq(messages.conversationId, options.conversationId)
        : eq(messages.contactId, contact.id),
    )
    .orderBy(desc(messages.createdAt))
    .limit(options.messageLimit ?? 12);

  const recentWithMedia: { direction: string; text: string; at: string }[] = [];
  for (const m of recent.reverse()) {
    let text = m.text;
    if (m.contentType === "IMAGE" || m.contentType === "TEXT_AND_IMAGE") {
      const assets = await db
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.messageId, m.id));
      const captions = assets
        .filter((a) => a.analysisStatus === "COMPLETED" && a.analysis?.caption)
        .map((a) => `[Image observed: ${a.analysis!.caption}${
          a.analysis!.contextualInterpretation
            ? `; interpretation: ${a.analysis!.contextualInterpretation}`
            : ""
        }]`);
      if (captions.length) text = `${text}${text ? "\n" : ""}${captions.join("\n")}`;
    }
    recentWithMedia.push({
      direction: m.direction,
      text,
      at: format(m.createdAt, "yyyy-MM-dd HH:mm"),
    });
  }

  return {
    user: user ?? null,
    contact,
    confirmedFacts: facts.map(
      (f) => `${f.fact}${f.date ? ` (${f.date})` : ""}`,
    ),
    openCommitments: openCommitments.map(
      (c) =>
        `${c.madeBy === "USER" ? "User promised" : "Contact promised"}: ${c.description}${c.dueAt ? ` (due ${format(c.dueAt, "yyyy-MM-dd")})` : ""}`,
    ),
    recentMessages: recentWithMedia,
    daysSinceLastInteraction: contact.lastInteractionAt
      ? differenceInCalendarDays(new Date(), contact.lastInteractionAt)
      : null,
  };
}

export function contactDisplayName(contact: Contact): string {
  return (
    contact.displayName ??
    contact.nickname ??
    [contact.firstName, contact.lastName].filter(Boolean).join(" ")
  );
}

/** Render a compact, prompt-ready description of the context package. */
export function renderContext(ctx: ContactContext): string {
  const c = ctx.contact;
  const profile = c.profile ?? {};
  const lines: string[] = [];

  lines.push(`## Contact`);
  lines.push(`Name: ${contactDisplayName(c)}`);
  lines.push(`Relationship: ${c.relationshipLabel ?? c.relationshipType}, importance ${c.importance}`);
  if (c.relationshipVector) {
    const v = c.relationshipVector;
    const dims = Object.entries(v)
      .filter(([, value]) => typeof value === "number")
      .map(([k, value]) => `${k}=${value}`);
    if (dims.length > 0) lines.push(`Relationship vector (0-100): ${dims.join(", ")}`);
  }
  if (c.birthday) lines.push(`Birthday: ${c.birthday}`);
  if (c.preferredLanguage) lines.push(`Language: ${c.preferredLanguage}`);
  if (c.communicationStyle)
    lines.push(`Communication style: ${c.communicationStyle}`);
  if (c.emojiStyle) lines.push(`Emoji style: ${c.emojiStyle}`);
  lines.push(`Humor allowed: ${c.humorAllowed ? "yes" : "no"}`);
  if (ctx.daysSinceLastInteraction !== null)
    lines.push(`Days since last interaction: ${ctx.daysSinceLastInteraction}`);
  if (c.notes) lines.push(`Notes: ${c.notes}`);

  const cp = c.communicationProfile;
  if (cp) {
    lines.push(`## How the user writes to this contact (learned from real conversations)`);
    if (cp.ownerStyle) {
      const os = cp.ownerStyle;
      const parts: string[] = [];
      if (os.language) parts.push(`language ${os.language}`);
      if (os.averageLength) parts.push(`${os.averageLength} messages`);
      if (typeof os.formality === "number") parts.push(`formality ${os.formality}`);
      if (typeof os.humor === "number") parts.push(`humor ${os.humor}`);
      if (typeof os.sarcasm === "number") parts.push(`sarcasm ${os.sarcasm}`);
      if (typeof os.emojiFrequency === "number") parts.push(`emoji frequency ${os.emojiFrequency}`);
      if (os.emojiTypes?.length) parts.push(`emojis used: ${os.emojiTypes.join(" ")}`);
      if (typeof os.swearing === "number") parts.push(`swearing ${os.swearing}`);
      if (os.greetingStyle) parts.push(`greeting: ${os.greetingStyle}`);
      if (os.signOffStyle) parts.push(`sign-off: ${os.signOffStyle}`);
      lines.push(`Owner style: ${parts.join(", ")}`);
    }
    if (cp.recurringExpressions?.length)
      lines.push(`Recurring expressions: ${cp.recurringExpressions.join(", ")}`);
    if (cp.commonTopics?.length)
      lines.push(`Common topics: ${cp.commonTopics.join(", ")}`);
    if (cp.avoidedTopics?.length)
      lines.push(`Avoided topics: ${cp.avoidedTopics.join(", ")}`);
  }

  const profileEntries = Object.entries(profile).filter(
    ([, v]) => v && (!Array.isArray(v) || v.length > 0),
  );
  if (profileEntries.length > 0) {
    lines.push(`## Profile`);
    for (const [k, v] of profileEntries) {
      lines.push(`${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
    }
  }

  if (ctx.confirmedFacts.length > 0) {
    lines.push(`## Known facts`);
    for (const f of ctx.confirmedFacts) lines.push(`- ${f}`);
  }

  if (ctx.openCommitments.length > 0) {
    lines.push(`## Open commitments`);
    for (const p of ctx.openCommitments) lines.push(`- ${p}`);
  }

  if (ctx.recentMessages.length > 0) {
    lines.push(`## Recent conversation (oldest first)`);
    for (const m of ctx.recentMessages) {
      const who =
        m.direction === "INBOUND"
          ? "Contact"
          : m.direction === "SYSTEM"
            ? "System"
            : "User";
      lines.push(`[${m.at}] ${who}: ${m.text}`);
    }
  }

  if (ctx.user) {
    lines.push(`## User (the owner of this system)`);
    lines.push(`Name: ${ctx.user.name}`);
    lines.push(`Preferred language: ${ctx.user.preferredLanguage}`);
    const vp = ctx.user.voiceProfile;
    if (vp) {
      const parts = Object.entries(vp)
        .filter(([, v]) => v && (!Array.isArray(v) || v.length > 0))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : v}`);
      if (parts.length > 0) lines.push(`Voice: ${parts.join("; ")}`);
    }
  }

  return lines.join("\n");
}
