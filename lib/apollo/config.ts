import "server-only";

import { getProviderStatus } from "@/lib/providers/config";
import {
  clampApolloLimit,
  DEFAULT_APOLLO_FILTERS,
  parseCsvList,
} from "@/lib/apollo/filters";
import type { ApolloSearchFilters } from "@/lib/db/schema";

export interface ApolloPublicConfig {
  defaultTitles: string;
  defaultSeniorities: string;
  defaultIndustries: string;
  defaultPersonLocations: string;
  defaultOrganizationLocations: string;
  defaultKeywords: string;
  defaultLimit: number;
  revealPhoneNumbers: boolean;
  requirePhone: boolean;
  includeSimilarTitles: boolean;
}

export const DEFAULT_APOLLO_PUBLIC_CONFIG: ApolloPublicConfig = {
  defaultTitles: DEFAULT_APOLLO_FILTERS.titles.join(", "),
  defaultSeniorities: DEFAULT_APOLLO_FILTERS.seniorities.join(", "),
  defaultIndustries: "",
  defaultPersonLocations: DEFAULT_APOLLO_FILTERS.personLocations.join(", "),
  defaultOrganizationLocations: "",
  defaultKeywords: "",
  defaultLimit: DEFAULT_APOLLO_FILTERS.limit,
  revealPhoneNumbers: true,
  requirePhone: true,
  includeSimilarTitles: true,
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (value === true || value === "true") return true;
  if (value === false || value === "false") return false;
  return fallback;
}

export function parseApolloPublicConfig(
  raw: Record<string, unknown> | null | undefined,
): ApolloPublicConfig {
  const source = raw ?? {};
  return {
    defaultTitles: asString(
      source.defaultTitles,
      DEFAULT_APOLLO_PUBLIC_CONFIG.defaultTitles,
    ),
    defaultSeniorities: asString(
      source.defaultSeniorities,
      DEFAULT_APOLLO_PUBLIC_CONFIG.defaultSeniorities,
    ),
    defaultIndustries: asString(
      source.defaultIndustries,
      DEFAULT_APOLLO_PUBLIC_CONFIG.defaultIndustries,
    ),
    defaultPersonLocations: asString(
      source.defaultPersonLocations,
      DEFAULT_APOLLO_PUBLIC_CONFIG.defaultPersonLocations,
    ),
    defaultOrganizationLocations: asString(
      source.defaultOrganizationLocations,
      DEFAULT_APOLLO_PUBLIC_CONFIG.defaultOrganizationLocations,
    ),
    defaultKeywords: asString(
      source.defaultKeywords,
      DEFAULT_APOLLO_PUBLIC_CONFIG.defaultKeywords,
    ),
    defaultLimit: clampApolloLimit(
      Number(source.defaultLimit ?? DEFAULT_APOLLO_PUBLIC_CONFIG.defaultLimit),
    ),
    revealPhoneNumbers: asBoolean(
      source.revealPhoneNumbers,
      DEFAULT_APOLLO_PUBLIC_CONFIG.revealPhoneNumbers,
    ),
    requirePhone: asBoolean(
      source.requirePhone,
      DEFAULT_APOLLO_PUBLIC_CONFIG.requirePhone,
    ),
    includeSimilarTitles: asBoolean(
      source.includeSimilarTitles,
      DEFAULT_APOLLO_PUBLIC_CONFIG.includeSimilarTitles,
    ),
  };
}

export function defaultFiltersFromConfig(
  config: ApolloPublicConfig,
): ApolloSearchFilters {
  return {
    titles: parseCsvList(config.defaultTitles),
    seniorities: parseCsvList(config.defaultSeniorities),
    industries: parseCsvList(config.defaultIndustries),
    personLocations: parseCsvList(config.defaultPersonLocations),
    organizationLocations: parseCsvList(config.defaultOrganizationLocations),
    keywords: config.defaultKeywords.trim(),
    includeSimilarTitles: config.includeSimilarTitles,
    requirePhone: config.requirePhone,
    limit: config.defaultLimit,
  };
}

export async function getApolloPublicConfig(): Promise<ApolloPublicConfig> {
  const status = await getProviderStatus();
  return parseApolloPublicConfig(status.apollo?.publicConfig);
}
