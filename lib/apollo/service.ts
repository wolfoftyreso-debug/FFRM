import "server-only";

import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  apolloAudiences,
  apolloLists,
  apolloProspects,
  contacts,
  type ApolloSearchFilters,
} from "@/lib/db/schema";
import { getApolloCredentials } from "@/lib/providers/config";
import { logActivity } from "@/lib/activity";
import {
  apolloWebhookUrl,
  enrichApolloPeople,
  parseApolloPhonePayload,
  pickBestPhone,
  pollApolloWebhookResult,
  searchApolloPeople,
  type ApolloPerson,
} from "@/lib/apollo/client";
import { describeApolloFilters, normalizeApolloFilters } from "@/lib/apollo/filters";
import { getApolloPublicConfig } from "@/lib/apollo/config";

const ENRICH_CHUNK = 10;

export async function previewApolloAudience(filters: ApolloSearchFilters) {
  const { apiKey } = await getApolloCredentials();
  return searchApolloPeople(apiKey, normalizeApolloFilters(filters));
}

function displayPersonName(person: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim();
}

function listNameFor(filters: ApolloSearchFilters) {
  const who = filters.titles.slice(0, 2).join(", ") || "Målgrupp";
  const where =
    filters.personLocations[0] ?? filters.organizationLocations[0] ?? "geografi";
  return `${who} · ${where}`;
}

async function ownerId(): Promise<string> {
  const db = await getDb();
  const { users } = await import("@/lib/db/schema");
  const [user] = await db.select({ id: users.id }).from(users).limit(1);
  if (!user) throw new Error("Owner profile is unavailable");
  return user.id;
}

export async function saveApolloAudience(input: {
  name: string;
  filters: ApolloSearchFilters;
}) {
  const db = await getDb();
  const filters = normalizeApolloFilters(input.filters);
  const name = input.name.trim() || describeApolloFilters(filters);
  const [row] = await db
    .insert(apolloAudiences)
    .values({ name, filters })
    .returning();
  await logActivity({
    actor: "USER",
    action: "APOLLO_AUDIENCE_SAVED",
    summary: `Apollo-målgrupp sparad: ${row.name}`,
    entityType: "apollo_audience",
    entityId: row.id,
  });
  return row;
}

export async function deleteApolloAudience(id: string) {
  const db = await getDb();
  await db.delete(apolloAudiences).where(eq(apolloAudiences.id, id));
}

export async function listApolloAudiences() {
  const db = await getDb();
  return db
    .select()
    .from(apolloAudiences)
    .orderBy(desc(apolloAudiences.updatedAt));
}

export async function listApolloLists(limit = 20) {
  const db = await getDb();
  return db
    .select()
    .from(apolloLists)
    .orderBy(desc(apolloLists.createdAt))
    .limit(limit);
}

export async function getApolloListDetail(id: string) {
  const db = await getDb();
  const [list] = await db
    .select()
    .from(apolloLists)
    .where(eq(apolloLists.id, id))
    .limit(1);
  if (!list) return null;
  const prospects = await db
    .select()
    .from(apolloProspects)
    .where(eq(apolloProspects.listId, id))
    .orderBy(desc(apolloProspects.hasDirectPhone), apolloProspects.firstName);
  return { list, prospects };
}

function prospectValues(listId: string, person: ApolloPerson) {
  return {
    listId,
    apolloPersonId: person.id,
    firstName: person.firstName,
    lastName: person.lastName,
    title: person.title,
    organizationName: person.organizationName,
    organizationDomain: person.organizationDomain,
    city: person.city,
    state: person.state,
    country: person.country,
    email: person.email,
    hasDirectPhone: person.hasDirectPhone,
    status: "FOUND" as const,
  };
}

export async function fetchApolloPhones(input: {
  filters: ApolloSearchFilters;
  audienceId?: string | null;
  name?: string;
}) {
  const filters = normalizeApolloFilters(input.filters);
  const { apiKey } = await getApolloCredentials();
  const config = await getApolloPublicConfig();
  const search = await searchApolloPeople(apiKey, filters);
  const db = await getDb();
  const [list] = await db
    .insert(apolloLists)
    .values({
      name: input.name?.trim() || listNameFor(filters),
      audienceId: input.audienceId ?? null,
      filters,
      status: search.people.length ? "ENRICHING" : "READY",
      totalFound: search.total,
    })
    .returning();

  if (search.people.length === 0) {
    return { list, imported: 0, phoneCount: 0 };
  }

  await db.insert(apolloProspects).values(
    search.people.map((person) => prospectValues(list.id, person)),
  );

  if (!config.revealPhoneNumbers) {
    await db
      .update(apolloLists)
      .set({ status: "SEARCHED", updatedAt: sql`now()` })
      .where(eq(apolloLists.id, list.id));
    return { list, imported: 0, phoneCount: 0 };
  }

  const webhookUrl = apolloWebhookUrl();
  const requestIds: string[] = [];
  let credits = 0;
  const ids = search.people.map((person) => person.id);
  for (let index = 0; index < ids.length; index += ENRICH_CHUNK) {
    const chunk = ids.slice(index, index + ENRICH_CHUNK);
    const result = await enrichApolloPeople(apiKey, chunk, webhookUrl);
    if (result.requestId) requestIds.push(result.requestId);
    credits += result.creditsConsumed;
    const workPhones = new Map(
      result.matches
        .map((match) => {
          const picked = pickBestPhone([], match.organizationPhone);
          return picked ? [match.id, picked] as const : null;
        })
        .filter((item): item is readonly [string, { phone: string; type: string }] =>
          item !== null,
        ),
    );
    for (const person of result.matches) {
      const work = workPhones.get(person.id);
      await db
        .update(apolloProspects)
        .set({
          email: person.email ?? undefined,
          title: person.title ?? undefined,
          organizationName: person.organizationName ?? undefined,
          requestId: result.requestId,
          status: work ? "READY" : "ENRICHING",
          phoneNumber: work?.phone,
          phoneType: work?.type,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(apolloProspects.listId, list.id),
            eq(apolloProspects.apolloPersonId, person.id),
          ),
        );
    }
    await db
      .update(apolloProspects)
      .set({ requestId: result.requestId, status: "ENRICHING", updatedAt: sql`now()` })
      .where(
        and(
          eq(apolloProspects.listId, list.id),
          inArray(apolloProspects.apolloPersonId, chunk),
          eq(apolloProspects.status, "FOUND"),
        ),
      );
  }

  const [ready] = await db
    .select({ count: sql<number>`count(*)` })
    .from(apolloProspects)
    .where(
      and(eq(apolloProspects.listId, list.id), eq(apolloProspects.status, "READY")),
    );
  await db
    .update(apolloLists)
    .set({
      status: Number(ready?.count ?? 0) >= search.people.length ? "READY" : "ENRICHING",
      enrichedCount: search.people.length,
      phoneCount: Number(ready?.count ?? 0),
      creditsConsumed: credits,
      requestIds,
      updatedAt: sql`now()`,
    })
    .where(eq(apolloLists.id, list.id));

  await logActivity({
    actor: "APOLLO",
    action: "APOLLO_PHONES_REQUESTED",
    summary: `Hämtar ${search.people.length} Apollo-nummer för ${list.name}`,
    entityType: "apollo_list",
    entityId: list.id,
  });
  return { list, imported: 0, phoneCount: Number(ready?.count ?? 0) };
}

export async function applyApolloPhonePayload(payload: unknown) {
  const parsed = parseApolloPhonePayload(payload);
  const db = await getDb();
  let updated = 0;
  for (const person of parsed.people) {
    if (!person.id) continue;
    const picked = pickBestPhone(person.phoneNumbers);
    const rows = await db
      .select()
      .from(apolloProspects)
      .where(eq(apolloProspects.apolloPersonId, person.id));
    if (rows.length === 0) continue;
    for (const row of rows) {
      await db
        .update(apolloProspects)
        .set({
          phoneNumber: picked?.phone ?? row.phoneNumber,
          phoneType: picked?.type ?? row.phoneType,
          status: picked ? "READY" : row.phoneNumber ? "READY" : "FAILED",
          updatedAt: sql`now()`,
        })
        .where(eq(apolloProspects.id, row.id));
      updated += 1;
    }
  }

  const listIds = [
    ...new Set(
      (
        await db
          .select({ listId: apolloProspects.listId })
          .from(apolloProspects)
          .where(
            inArray(
              apolloProspects.apolloPersonId,
              parsed.people.map((person) => person.id).filter(Boolean),
            ),
          )
      ).map((row) => row.listId),
    ),
  ];
  for (const listId of listIds) {
    await refreshApolloListCounts(listId, parsed.creditsConsumed);
  }
  return { updated, creditsConsumed: parsed.creditsConsumed };
}

async function refreshApolloListCounts(listId: string, extraCredits = 0) {
  const db = await getDb();
  const [counts] = await db
    .select({
      phoneCount: sql<number>`count(*) filter (where ${apolloProspects.phoneNumber} is not null)`,
      pending: sql<number>`count(*) filter (where ${apolloProspects.status} = 'ENRICHING')`,
      total: sql<number>`count(*)`,
    })
    .from(apolloProspects)
    .where(eq(apolloProspects.listId, listId));
  const pending = Number(counts?.pending ?? 0);
  await db
    .update(apolloLists)
    .set({
      phoneCount: Number(counts?.phoneCount ?? 0),
      creditsConsumed: sql`${apolloLists.creditsConsumed} + ${extraCredits}`,
      status: pending > 0 ? "ENRICHING" : "READY",
      lastError: null,
      updatedAt: sql`now()`,
    })
    .where(eq(apolloLists.id, listId));
}

export async function pollPendingApolloPhones() {
  const db = await getDb();
  const pending = await db
    .select({
      listId: apolloProspects.listId,
      requestId: apolloProspects.requestId,
    })
    .from(apolloProspects)
    .where(
      and(
        eq(apolloProspects.status, "ENRICHING"),
        sql`${apolloProspects.requestId} is not null`,
      ),
    )
    .limit(40);
  if (pending.length === 0) return { polled: 0, updated: 0 };
  const { apiKey } = await getApolloCredentials();
  const seen = new Set<string>();
  let updated = 0;
  for (const row of pending) {
    if (!row.requestId || seen.has(row.requestId)) continue;
    seen.add(row.requestId);
    const payload = await pollApolloWebhookResult(apiKey, row.requestId);
    if (!payload) continue;
    updated += (await applyApolloPhonePayload(payload)).updated;
  }
  return { polled: seen.size, updated };
}

export async function importApolloList(listId: string) {
  const db = await getDb();
  const userId = await ownerId();
  const rows = await db
    .select()
    .from(apolloProspects)
    .where(
      and(
        eq(apolloProspects.listId, listId),
        sql`${apolloProspects.phoneNumber} is not null`,
      ),
    );
  let imported = 0;
  let skipped = 0;
  for (const row of rows) {
    if (row.status === "IMPORTED" && row.contactId) {
      skipped += 1;
      continue;
    }
    const [existing] = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(
        and(eq(contacts.userId, userId), eq(contacts.phoneNumber, row.phoneNumber!)),
      )
      .limit(1);
    if (existing) {
      await db
        .update(apolloProspects)
        .set({
          contactId: existing.id,
          status: "SKIPPED",
          updatedAt: sql`now()`,
        })
        .where(eq(apolloProspects.id, row.id));
      skipped += 1;
      continue;
    }
    const firstName = row.firstName?.trim() || displayPersonName(row) || "Apollo";
    const [created] = await db
      .insert(contacts)
      .values({
        userId,
        firstName,
        lastName: row.lastName,
        displayName: displayPersonName(row) || firstName,
        phoneNumber: row.phoneNumber,
        email: row.email,
        relationshipType: "WORK",
        relationshipLabel: "Apollo",
        notes: [
          row.title,
          row.organizationName,
          [row.city, row.country].filter(Boolean).join(", "),
          "Importerad från Apollo",
        ]
          .filter(Boolean)
          .join(" · "),
        profile: {
          company: row.organizationName ?? undefined,
          jobTitle: row.title ?? undefined,
          places: [row.city, row.country].filter((item): item is string => !!item),
        },
      })
      .returning();
    await db
      .update(apolloProspects)
      .set({
        contactId: created.id,
        status: "IMPORTED",
        updatedAt: sql`now()`,
      })
      .where(eq(apolloProspects.id, row.id));
    imported += 1;
  }
  await db
    .update(apolloLists)
    .set({
      importedCount: imported,
      skippedCount: skipped,
      status: "IMPORTED",
      updatedAt: sql`now()`,
    })
    .where(eq(apolloLists.id, listId));
  await logActivity({
    actor: "USER",
    action: "APOLLO_CONTACTS_IMPORTED",
    summary: `Importerade ${imported} Apollo-kontakter`,
    entityType: "apollo_list",
    entityId: listId,
  });
  return { imported, skipped };
}

export function apolloListPhoneText(prospects: { phoneNumber: string | null }[]) {
  return prospects
    .map((prospect) => prospect.phoneNumber)
    .filter((phone): phone is string => !!phone)
    .join("\n");
}
