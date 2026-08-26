import { and, asc, eq, inArray, isNull, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  campaignRecipients,
  contacts,
  messageCampaigns,
  type Contact,
} from "@/lib/db/schema";
import { sendMessage } from "@/lib/sms/send-message";
import {
  MAX_BROADCAST_RECIPIENTS,
  parsePhoneList,
  personalizeBroadcast,
} from "@/lib/sms/phone-list";
import { normalizePhoneNumber } from "@/lib/phone";
import { logActivity } from "@/lib/activity";

const SEND_BATCH = 80;

export interface BroadcastRecipientInput {
  phoneNumber: string;
  firstName?: string | null;
  contactId?: string | null;
}

export async function createBroadcastCampaign(input: {
  templateText: string;
  personalized: boolean;
  contactIds: string[];
  importedText?: string;
}): Promise<{ campaignId: string; total: number }> {
  const templateText = input.templateText.trim();
  if (!templateText) throw new Error("Write a message first");
  if (input.personalized && !/\*namn\*|\*name\*/i.test(templateText)) {
    throw new Error("Add *namn* in the message when Personal is on");
  }

  const db = await getDb();
  const selectedIds = [...new Set(input.contactIds.filter(Boolean))].slice(
    0,
    MAX_BROADCAST_RECIPIENTS,
  );
  const selectedContacts =
    selectedIds.length > 0
      ? await db
          .select()
          .from(contacts)
          .where(
            and(
              inArray(contacts.id, selectedIds),
              isNull(contacts.archivedAt),
            ),
          )
      : [];

  const imported = parsePhoneList(input.importedText ?? "");
  const unmatchedPhones = imported
    .map((entry) => entry.phoneNumber)
    .filter((phone) => !selectedContacts.some((c) => c.phoneNumber === phone));
  const matchedImports =
    unmatchedPhones.length > 0
      ? await db
          .select()
          .from(contacts)
          .where(
            and(
              inArray(contacts.phoneNumber, unmatchedPhones),
              isNull(contacts.archivedAt),
            ),
          )
      : [];
  const recipients = mergeRecipients(
    [...selectedContacts, ...matchedImports],
    imported,
  );
  if (recipients.length === 0) {
    throw new Error("Choose at least one contact or import a number list");
  }

  const [campaign] = await db
    .insert(messageCampaigns)
    .values({
      name: campaignName(templateText, recipients.length),
      templateText,
      personalized: input.personalized,
      status: "QUEUED",
      totalCount: recipients.length,
    })
    .returning({ id: messageCampaigns.id });

  const rows = recipients.map((recipient) => ({
    campaignId: campaign.id,
    contactId: recipient.contactId ?? null,
    phoneNumber: recipient.phoneNumber,
    firstName: recipient.firstName ?? null,
      renderedText: personalizeBroadcast(
        templateText,
        recipient.firstName ?? null,
        input.personalized,
      ),
  }));
  const INSERT_CHUNK = 200;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
    await db.insert(campaignRecipients).values(rows.slice(i, i + INSERT_CHUNK));
  }

  await logActivity({
    actor: "USER",
    action: "BROADCAST_SAVED",
    summary: `Saved batch to ${recipients.length} recipients`,
    entityType: "messageCampaign",
    entityId: campaign.id,
  });

  return { campaignId: campaign.id, total: recipients.length };
}

function mergeRecipients(
  selected: Contact[],
  imported: { phoneNumber: string; firstName: string | null }[],
): BroadcastRecipientInput[] {
  const byPhone = new Map<string, BroadcastRecipientInput>();
  for (const contact of selected) {
    const phoneNumber = contact.phoneNumber
      ? normalizePhoneNumber(contact.phoneNumber)
      : null;
    if (!phoneNumber) continue;
    byPhone.set(phoneNumber, {
      phoneNumber,
      firstName: contact.firstName || contact.nickname || null,
      contactId: contact.id,
    });
  }
  for (const entry of imported) {
    const existing = byPhone.get(entry.phoneNumber);
    if (existing) {
      if (!existing.firstName && entry.firstName) {
        existing.firstName = entry.firstName;
      }
      continue;
    }
    if (byPhone.size >= MAX_BROADCAST_RECIPIENTS) break;
    byPhone.set(entry.phoneNumber, entry);
  }
  return [...byPhone.values()];
}

function campaignName(template: string, total: number): string {
  const preview = template.replace(/\s+/g, " ").slice(0, 42);
  return `${preview}${template.length > 42 ? "…" : ""} · ${total}`;
}

/** Sends one bounded slice of a saved batch. Safe to retry. */
export async function processCampaignQueue(
  now = new Date(),
): Promise<{ sent: number; failed: number }> {
  const db = await getDb();
  const stale = new Date(now.getTime() - 3 * 60 * 1000);
  const due = await db
    .select({ id: campaignRecipients.id })
    .from(campaignRecipients)
    .innerJoin(
      messageCampaigns,
      eq(messageCampaigns.id, campaignRecipients.campaignId),
    )
    .where(
      and(
        eq(campaignRecipients.status, "PENDING"),
        inArray(messageCampaigns.status, ["QUEUED", "SENDING"]),
        lt(campaignRecipients.sendAttemptCount, 4),
        or(
          isNull(campaignRecipients.sendingStartedAt),
          lt(campaignRecipients.sendingStartedAt, stale),
        ),
      ),
    )
    .orderBy(asc(campaignRecipients.createdAt))
    .limit(SEND_BATCH);
  if (due.length === 0) return { sent: 0, failed: 0 };

  const claimed = await db
    .update(campaignRecipients)
    .set({
      sendingStartedAt: now,
      sendAttemptCount: sql`${campaignRecipients.sendAttemptCount} + 1`,
    })
    .where(
      and(
        inArray(
          campaignRecipients.id,
          due.map((row) => row.id),
        ),
        eq(campaignRecipients.status, "PENDING"),
        or(
          isNull(campaignRecipients.sendingStartedAt),
          lt(campaignRecipients.sendingStartedAt, stale),
        ),
      ),
    )
    .returning();

  let sent = 0;
  let failed = 0;
  const touched = new Set<string>();

  for (const recipient of claimed) {
    touched.add(recipient.campaignId);
    await db
      .update(messageCampaigns)
      .set({
        status: "SENDING",
        startedAt: sql`coalesce(${messageCampaigns.startedAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(
        and(
          eq(messageCampaigns.id, recipient.campaignId),
          inArray(messageCampaigns.status, ["QUEUED", "SENDING"]),
        ),
      );

    if (!recipient.renderedText.trim()) {
      await finishRecipient(recipient.id, recipient.campaignId, "SKIPPED", {
        error: "Empty personalized message",
      });
      continue;
    }

    try {
      const result = await sendMessage({
        to: recipient.phoneNumber,
        text: recipient.renderedText,
        sender: "USER",
        contactId: recipient.contactId,
      });
      if (result.ok || result.message.status === "SENT_UNKNOWN") {
        await finishRecipient(recipient.id, recipient.campaignId, "SENT", {
          messageId: result.message.id,
        });
        sent += 1;
        continue;
      }
      await retryOrFail(recipient, result.error ?? "Send failed");
      failed += 1;
    } catch (err) {
      await retryOrFail(
        recipient,
        err instanceof Error ? err.message : String(err),
      );
      failed += 1;
    }
  }

  for (const campaignId of touched) {
    await refreshCampaignCounts(campaignId);
  }
  return { sent, failed };
}

async function retryOrFail(
  recipient: typeof campaignRecipients.$inferSelect,
  error: string,
): Promise<void> {
  if (recipient.sendAttemptCount >= 3) {
    await finishRecipient(recipient.id, recipient.campaignId, "FAILED", {
      error,
    });
    return;
  }
  const db = await getDb();
  await db
    .update(campaignRecipients)
    .set({
      error,
      sendingStartedAt: null,
    })
    .where(eq(campaignRecipients.id, recipient.id));
}

async function finishRecipient(
  id: string,
  campaignId: string,
  status: "SENT" | "FAILED" | "SKIPPED",
  extra: { messageId?: string; error?: string } = {},
): Promise<void> {
  const db = await getDb();
  await db
    .update(campaignRecipients)
    .set({
      status,
      messageId: extra.messageId ?? null,
      error: extra.error ?? null,
      sendingStartedAt: null,
      sentAt: status === "SENT" ? new Date() : null,
    })
    .where(eq(campaignRecipients.id, id));
  void campaignId;
}

async function refreshCampaignCounts(campaignId: string): Promise<void> {
  const db = await getDb();
  const [counts] = await db
    .select({
      pending: sql<number>`count(*) filter (where ${campaignRecipients.status} = 'PENDING')`,
      sent: sql<number>`count(*) filter (where ${campaignRecipients.status} = 'SENT')`,
      failed: sql<number>`count(*) filter (where ${campaignRecipients.status} = 'FAILED')`,
      skipped: sql<number>`count(*) filter (where ${campaignRecipients.status} = 'SKIPPED')`,
    })
    .from(campaignRecipients)
    .where(eq(campaignRecipients.campaignId, campaignId));

  const pending = Number(counts?.pending ?? 0);
  await db
    .update(messageCampaigns)
    .set({
      sentCount: Number(counts?.sent ?? 0),
      failedCount: Number(counts?.failed ?? 0),
      skippedCount: Number(counts?.skipped ?? 0),
      status: pending === 0 ? "COMPLETED" : "SENDING",
      completedAt: pending === 0 ? new Date() : null,
      updatedAt: sql`now()`,
    })
    .where(eq(messageCampaigns.id, campaignId));
}
