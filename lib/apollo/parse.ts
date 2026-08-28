import { normalizePhoneNumber } from "@/lib/phone";
import type { ApolloSearchFilters } from "@/lib/db/schema";

export interface ApolloPerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  organizationName: string | null;
  organizationDomain: string | null;
  organizationPhone: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  email: string | null;
  hasDirectPhone: boolean;
}

export interface ApolloPhoneNumber {
  sanitizedNumber: string | null;
  rawNumber: string | null;
  type: string | null;
  status: string | null;
}

export interface ApolloPhonePerson {
  id: string;
  status: string | null;
  phoneNumbers: ApolloPhoneNumber[];
}

export interface ApolloPhonePayload {
  status: string | null;
  creditsConsumed: number;
  people: ApolloPhonePerson[];
}

export function toApolloSearchBody(
  filters: ApolloSearchFilters,
  page = 1,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    page,
    per_page: filters.limit,
    include_similar_titles: filters.includeSimilarTitles,
  };
  if (filters.titles.length) body.person_titles = filters.titles;
  if (filters.seniorities.length) body.person_seniorities = filters.seniorities;
  if (filters.personLocations.length) {
    body.person_locations = filters.personLocations;
  }
  if (filters.organizationLocations.length) {
    body.organization_locations = filters.organizationLocations;
  }
  const keywords = [filters.keywords, ...filters.industries]
    .map((item) => item.trim())
    .filter(Boolean);
  if (keywords.length) body.q_keywords = keywords.join(" ");
  return body;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === "Yes";
}

export function mapApolloPerson(raw: unknown): ApolloPerson | null {
  const person = asRecord(raw);
  const organization = asRecord(person.organization ?? person.account);
  const id = asString(person.id) ?? asString(person.person_id);
  if (!id) return null;
  return {
    id,
    firstName: asString(person.first_name),
    lastName: asString(person.last_name) ?? asString(person.last_name_obfuscated),
    title: asString(person.title),
    organizationName:
      asString(organization.name) ?? asString(person.organization_name),
    organizationDomain:
      asString(organization.primary_domain) ??
      asString(person.organization_domain),
    organizationPhone:
      asString(organization.phone) ?? asString(person.organization_phone),
    city: asString(person.city),
    state: asString(person.state),
    country: asString(person.country),
    email: asString(person.email),
    hasDirectPhone: asBoolean(person.has_direct_phone),
  };
}

export function parseApolloPhonePayload(raw: unknown): ApolloPhonePayload {
  const root = asRecord(raw);
  const nested = asRecord(root.webhook_result);
  const source = Object.keys(nested).length ? nested : root;
  const peopleRaw = Array.isArray(source.people)
    ? source.people
    : Array.isArray(root.people)
      ? root.people
      : [];
  return {
    status: asString(source.status) ?? asString(root.status),
    creditsConsumed:
      Number(source.credits_consumed ?? root.credits_consumed ?? 0) || 0,
    people: peopleRaw.map((row) => {
      const person = asRecord(row);
      const numbers = Array.isArray(person.phone_numbers)
        ? person.phone_numbers
        : [];
      return {
        id: asString(person.id) ?? "",
        status: asString(person.status),
        phoneNumbers: numbers.map((item) => {
          const phone = asRecord(item);
          return {
            sanitizedNumber: asString(phone.sanitized_number),
            rawNumber: asString(phone.raw_number),
            type: asString(phone.type_cd),
            status: asString(phone.status_cd),
          };
        }),
      };
    }),
  };
}

const PHONE_TYPE_RANK: Record<string, number> = {
  mobile: 0,
  work_direct: 1,
  work_hq: 2,
  other: 3,
};

export function pickBestPhone(
  numbers: ApolloPhoneNumber[],
  fallback?: string | null,
): { phone: string; type: string } | null {
  const ranked = numbers
    .map((number) => {
      const phone =
        normalizePhoneNumber(number.sanitizedNumber ?? "") ??
        normalizePhoneNumber(number.rawNumber ?? "");
      return phone
        ? {
            phone,
            type: number.type ?? "other",
            rank: PHONE_TYPE_RANK[number.type ?? "other"] ?? 9,
          }
        : null;
    })
    .filter(
      (item): item is { phone: string; type: string; rank: number } =>
        item !== null,
    )
    .sort((a, b) => a.rank - b.rank);
  if (ranked[0]) return { phone: ranked[0].phone, type: ranked[0].type };
  if (!fallback) return null;
  const phone = normalizePhoneNumber(fallback);
  return phone ? { phone, type: "work_hq" } : null;
}
