import "server-only";

import { appUrl, optionalEnv } from "@/lib/env";
import type { ApolloSearchFilters } from "@/lib/db/schema";
import {
  mapApolloPerson,
  parseApolloPhonePayload,
  toApolloSearchBody,
  type ApolloPerson,
  type ApolloPhonePayload,
} from "@/lib/apollo/parse";

export type {
  ApolloPerson,
  ApolloPhoneNumber,
  ApolloPhonePayload,
  ApolloPhonePerson,
} from "@/lib/apollo/parse";
export {
  mapApolloPerson,
  parseApolloPhonePayload,
  pickBestPhone,
  toApolloSearchBody,
} from "@/lib/apollo/parse";

const APOLLO_API = "https://api.apollo.io/api/v1";

export interface ApolloSearchResult {
  people: ApolloPerson[];
  total: number;
}

export interface ApolloEnrichResult {
  requestId: string | null;
  creditsConsumed: number;
  matches: ApolloPerson[];
}

export function apolloWebhookUrl(): string {
  const publicUrl = appUrl();
  if (!publicUrl) {
    throw new Error("APP_URL is required to receive Apollo phone numbers");
  }
  const url = new URL("/api/webhooks/apollo/phone", publicUrl);
  const token = optionalEnv("WEBHOOK_TOKEN");
  if (token) url.searchParams.set("token", token);
  return url.toString();
}

export async function apolloRequest<T>(
  apiKey: string,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${APOLLO_API}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      accept: "application/json",
      "Cache-Control": "no-cache",
      "x-api-key": apiKey,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { error: text };
    }
  }
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: unknown }).error)
        : `Apollo ${response.status}`;
    const error = new Error(message);
    (error as Error & { status: number }).status = response.status;
    throw error;
  }
  return body as T;
}

export async function testApolloApiKey(apiKey: string): Promise<void> {
  await apolloRequest(apiKey, "/mixed_people/api_search", {
    method: "POST",
    body: JSON.stringify({ page: 1, per_page: 1 }),
  });
}

export async function searchApolloPeople(
  apiKey: string,
  filters: ApolloSearchFilters,
): Promise<ApolloSearchResult> {
  const payload = await apolloRequest<{
    people?: unknown[];
    contacts?: unknown[];
    pagination?: { total_entries?: number };
    total_entries?: number;
  }>(apiKey, "/mixed_people/api_search", {
    method: "POST",
    body: JSON.stringify(toApolloSearchBody(filters)),
  });
  const rows = [...(payload.people ?? []), ...(payload.contacts ?? [])];
  const people = rows
    .map(mapApolloPerson)
    .filter((person): person is ApolloPerson => person !== null)
    .filter((person) => !filters.requirePhone || person.hasDirectPhone);
  const total =
    payload.pagination?.total_entries ?? payload.total_entries ?? people.length;
  return { people, total };
}

export async function enrichApolloPeople(
  apiKey: string,
  personIds: string[],
  webhookUrl: string,
): Promise<ApolloEnrichResult> {
  if (personIds.length === 0) {
    return { requestId: null, creditsConsumed: 0, matches: [] };
  }
  if (personIds.length > 10) {
    throw new Error("Apollo enriches at most 10 people per request");
  }
  const params = new URLSearchParams({
    reveal_phone_number: "true",
    webhook_url: webhookUrl,
  });
  const payload = await apolloRequest<{
    request_id?: string | number;
    credits_consumed?: number;
    matches?: unknown[];
  }>(apiKey, `/people/bulk_match?${params.toString()}`, {
    method: "POST",
    body: JSON.stringify({
      details: personIds.map((id) => ({ id })),
    }),
  });
  return {
    requestId:
      payload.request_id === undefined || payload.request_id === null
        ? null
        : String(payload.request_id),
    creditsConsumed: Number(payload.credits_consumed ?? 0) || 0,
    matches: (payload.matches ?? [])
      .map(mapApolloPerson)
      .filter((person): person is ApolloPerson => person !== null),
  };
}

export async function pollApolloWebhookResult(
  apiKey: string,
  requestId: string,
): Promise<ApolloPhonePayload | null> {
  try {
    const payload = await apolloRequest<unknown>(
      apiKey,
      `/webhook_result/${encodeURIComponent(requestId)}`,
    );
    return parseApolloPhonePayload(payload);
  } catch (error) {
    const status = (error as Error & { status?: number }).status;
    if (status === 404) return null;
    throw error;
  }
}
