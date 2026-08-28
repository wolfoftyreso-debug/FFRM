import { and, asc, desc, eq, inArray, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contactMedia, contacts, users } from "@/lib/db/schema";
import { extractCommunicationProfile } from "./style";
import { contactDisplayName } from "./context";
import { logActivity } from "@/lib/activity";
import { cleanErrorMessage } from "@/lib/errors";

/** Retryable, provenance-backed communication-style extraction. */
export async function processContactStyle(contactId: string): Promise<boolean> {
  const db = await getDb();
  const stale = new Date(Date.now() - 5 * 60 * 1000);
  const candidates = await db
    .select({ id: contactMedia.id })
    .from(contactMedia)
    .where(
      and(
        eq(contactMedia.contactId, contactId),
        lt(contactMedia.retryCount, 3),
        or(
          eq(contactMedia.analysisStatus, "PENDING"),
          eq(contactMedia.analysisStatus, "FAILED"),
          and(
            eq(contactMedia.analysisStatus, "PROCESSING"),
            lt(contactMedia.analyzedAt, stale),
          ),
        ),
      ),
    );
  if (candidates.length === 0) return false;
  const ids = candidates.map((c) => c.id);
  const claimed = await db
    .update(contactMedia)
    .set({
      analysisStatus: "PROCESSING",
      retryCount: sql`${contactMedia.retryCount} + 1`,
      analyzedAt: new Date(),
    })
    .where(inArray(contactMedia.id, ids))
    .returning({ id: contactMedia.id });
  if (claimed.length === 0) return false;

  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, contactId));
  const [owner] = await db.select().from(users).limit(1);
  if (!contact) return false;
  const screenshots = await db
    .select()
    .from(contactMedia)
    .where(eq(contactMedia.contactId, contactId))
    .orderBy(desc(contactMedia.createdAt))
    .limit(10);

  try {
    const { profile } = await extractCommunicationProfile({
      contactName: contactDisplayName(contact),
      ownerName: owner?.name ?? "the owner",
      images: screenshots.reverse().map((m) => ({
        mimeType: m.mimeType,
        base64: m.dataBase64,
      })),
    });
    await db.transaction(async (tx) => {
      await tx
        .update(contacts)
        .set({ communicationProfile: profile, updatedAt: sql`now()` })
        .where(eq(contacts.id, contactId));
      await tx
        .update(contactMedia)
        .set({
          analysisStatus: "COMPLETED",
          analysisError: null,
          analyzedAt: new Date(),
        })
        .where(inArray(contactMedia.id, screenshots.map((m) => m.id)));
    });
    await logActivity({
      actor: "AI",
      action: "STYLE_EXTRACTED",
      summary: `Communication profile rebuilt from ${screenshots.length} screenshot(s) for ${contactDisplayName(contact)}`,
      contactId,
    });
    return true;
  } catch (err) {
    const error = cleanErrorMessage(err);
    await db
      .update(contactMedia)
      .set({
        analysisStatus: "FAILED",
        analysisError: error,
        analyzedAt: new Date(),
      })
      .where(inArray(contactMedia.id, claimed.map((m) => m.id)));
    await logActivity({
      actor: "SYSTEM",
      action: "STYLE_EXTRACTION_FAILED",
      summary: `Style extraction failed and will retry: ${error.slice(0, 150)}`,
      contactId,
    });
    return false;
  }
}

export async function findStylesNeedingRetry(): Promise<string[]> {
  const db = await getDb();
  const stale = new Date(Date.now() - 5 * 60 * 1000);
  const rows = await db
    .select({ contactId: contactMedia.contactId })
    .from(contactMedia)
    .where(
      and(
        lt(contactMedia.retryCount, 3),
        or(
          eq(contactMedia.analysisStatus, "PENDING"),
          eq(contactMedia.analysisStatus, "FAILED"),
          and(
            eq(contactMedia.analysisStatus, "PROCESSING"),
            lt(contactMedia.analyzedAt, stale),
          ),
        ),
      ),
    )
    .orderBy(asc(contactMedia.createdAt))
    .limit(30);
  return [...new Set(rows.map((r) => r.contactId))].slice(0, 10);
}
