import type { ApolloSearchFilters } from "@/lib/db/schema";

export const APOLLO_SENIORITIES = [
  { value: "owner", label: "Owner" },
  { value: "founder", label: "Founder" },
  { value: "c_suite", label: "C-suite / VD" },
  { value: "partner", label: "Partner" },
  { value: "vp", label: "VP" },
  { value: "head", label: "Head of" },
  { value: "director", label: "Director" },
  { value: "manager", label: "Manager" },
  { value: "senior", label: "Senior" },
  { value: "entry", label: "Entry" },
  { value: "intern", label: "Intern" },
] as const;

export const APOLLO_TITLE_PRESETS = [
  "VD",
  "CEO",
  "Founder",
  "Inköpschef",
  "Marknadschef",
  "Fastighetschef",
  "Butikschef",
  "HR-chef",
  "IT-chef",
  "Sales Manager",
];

export const APOLLO_LOCATION_PRESETS = [
  "Sverige",
  "Stockholm",
  "Göteborg",
  "Malmö",
  "Uppsala",
  "Norge",
  "Danmark",
  "Finland",
  "Tyskland",
  "Storbritannien",
];

export const APOLLO_INDUSTRY_PRESETS = [
  "fastighet",
  "bygg",
  "detaljhandel",
  "IT",
  "logistik",
  "vård",
  "industri",
  "finans",
];

export const DEFAULT_APOLLO_FILTERS: ApolloSearchFilters = {
  titles: ["VD", "CEO", "Founder"],
  seniorities: ["c_suite", "owner", "founder"],
  industries: [],
  personLocations: ["Sverige"],
  organizationLocations: [],
  keywords: "",
  includeSimilarTitles: true,
  requirePhone: true,
  limit: 25,
};

export function parseCsvList(value: string | null | undefined): string[] {
  if (!value) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const part of value.split(/[,;\n]/)) {
    const item = part.trim();
    if (!item) continue;
    const key = item.toLocaleLowerCase("sv-SE");
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

export function joinCsvList(values: string[]): string {
  return values.map((value) => value.trim()).filter(Boolean).join(", ");
}

export function clampApolloLimit(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_APOLLO_FILTERS.limit;
  return Math.min(100, Math.max(1, Math.round(value)));
}

export function normalizeApolloFilters(
  input: Partial<ApolloSearchFilters> | null | undefined,
): ApolloSearchFilters {
  const titles = (input?.titles ?? []).map((item) => item.trim()).filter(Boolean);
  const seniorities = (input?.seniorities ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter((item) => APOLLO_SENIORITIES.some((option) => option.value === item));
  return {
    titles,
    seniorities,
    industries: (input?.industries ?? [])
      .map((item) => item.trim())
      .filter(Boolean),
    personLocations: (input?.personLocations ?? [])
      .map((item) => item.trim())
      .filter(Boolean),
    organizationLocations: (input?.organizationLocations ?? [])
      .map((item) => item.trim())
      .filter(Boolean),
    keywords: input?.keywords?.trim() ?? "",
    includeSimilarTitles: input?.includeSimilarTitles !== false,
    requirePhone: input?.requirePhone !== false,
    limit: clampApolloLimit(input?.limit ?? DEFAULT_APOLLO_FILTERS.limit),
  };
}

export function filtersFromForm(input: {
  titles?: string;
  seniorities?: string;
  industries?: string;
  personLocations?: string;
  organizationLocations?: string;
  keywords?: string;
  includeSimilarTitles?: string | boolean;
  requirePhone?: string | boolean;
  limit?: string | number;
}): ApolloSearchFilters {
  return normalizeApolloFilters({
    titles: parseCsvList(input.titles),
    seniorities: parseCsvList(input.seniorities),
    industries: parseCsvList(input.industries),
    personLocations: parseCsvList(input.personLocations),
    organizationLocations: parseCsvList(input.organizationLocations),
    keywords: input.keywords ?? "",
    includeSimilarTitles:
      input.includeSimilarTitles === true ||
      input.includeSimilarTitles === "true" ||
      input.includeSimilarTitles === undefined,
    requirePhone:
      input.requirePhone === true ||
      input.requirePhone === "true" ||
      input.requirePhone === undefined,
    limit:
      typeof input.limit === "number"
        ? input.limit
        : Number(input.limit ?? DEFAULT_APOLLO_FILTERS.limit),
  });
}

export function describeApolloFilters(filters: ApolloSearchFilters): string {
  const parts = [
    filters.titles.join(", "),
    filters.seniorities
      .map(
        (value) =>
          APOLLO_SENIORITIES.find((option) => option.value === value)?.label ??
          value,
      )
      .join(", "),
    filters.personLocations.join(", "),
    filters.organizationLocations.join(", "),
    filters.industries.join(", "),
    filters.keywords,
  ].filter(Boolean);
  return parts.join(" · ") || "Öppen Apollo-sökning";
}

export function locationLabel(filters: ApolloSearchFilters): string {
  const locations = [
    ...filters.personLocations,
    ...filters.organizationLocations,
  ];
  return locations.length > 0 ? locations.join(", ") : "Valfri geografi";
}
