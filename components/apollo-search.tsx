"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  fetchApolloPhoneList,
  previewApolloSearch,
  saveApolloAudiencePreset,
} from "@/app/actions";
import {
  APOLLO_INDUSTRY_PRESETS,
  APOLLO_LOCATION_PRESETS,
  APOLLO_SENIORITIES,
  APOLLO_TITLE_PRESETS,
  joinCsvList,
  parseCsvList,
} from "@/lib/apollo/filters";
import { PendingActionButton } from "@/components/pending-action-button";

interface PreviewPerson {
  id: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  organizationName: string | null;
  city: string | null;
  country: string | null;
  hasDirectPhone: boolean;
}

function toggleValue(current: string, value: string) {
  const items = parseCsvList(current);
  const exists = items.some(
    (item) => item.toLocaleLowerCase("sv-SE") === value.toLocaleLowerCase("sv-SE"),
  );
  return joinCsvList(
    exists
      ? items.filter(
          (item) =>
            item.toLocaleLowerCase("sv-SE") !== value.toLocaleLowerCase("sv-SE"),
        )
      : [...items, value],
  );
}

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[13px] font-medium ${
        selected
          ? "bg-[var(--system-blue)] text-white"
          : "bg-black/[0.06] text-stone-700"
      }`}
    >
      {label}
    </button>
  );
}

export function ApolloSearchForm({
  defaults,
  audiences,
}: {
  defaults: {
    titles: string;
    seniorities: string;
    industries: string;
    personLocations: string;
    organizationLocations: string;
    keywords: string;
    includeSimilarTitles: boolean;
    requirePhone: boolean;
    limit: number;
  };
  audiences: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [titles, setTitles] = useState(defaults.titles);
  const [seniorities, setSeniorities] = useState(defaults.seniorities);
  const [industries, setIndustries] = useState(defaults.industries);
  const [personLocations, setPersonLocations] = useState(
    defaults.personLocations,
  );
  const [organizationLocations, setOrganizationLocations] = useState(
    defaults.organizationLocations,
  );
  const [keywords, setKeywords] = useState(defaults.keywords);
  const [includeSimilarTitles, setIncludeSimilarTitles] = useState(
    defaults.includeSimilarTitles,
  );
  const [requirePhone, setRequirePhone] = useState(defaults.requirePhone);
  const [limit, setLimit] = useState(String(defaults.limit));
  const [audienceName, setAudienceName] = useState("");
  const [people, setPeople] = useState<PreviewPerson[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  const selectedTitles = useMemo(() => parseCsvList(titles), [titles]);
  const selectedSeniorities = useMemo(
    () => parseCsvList(seniorities),
    [seniorities],
  );
  const selectedLocations = useMemo(
    () => parseCsvList(personLocations),
    [personLocations],
  );
  const selectedIndustries = useMemo(
    () => parseCsvList(industries),
    [industries],
  );

  function formData() {
    const data = new FormData();
    data.set("titles", titles);
    data.set("seniorities", seniorities);
    data.set("industries", industries);
    data.set("personLocations", personLocations);
    data.set("organizationLocations", organizationLocations);
    data.set("keywords", keywords);
    data.set("includeSimilarTitles", String(includeSimilarTitles));
    data.set("requirePhone", String(requirePhone));
    data.set("limit", limit);
    data.set("name", audienceName);
    return data;
  }

  function preview() {
    setError("");
    startTransition(async () => {
      try {
        const result = await previewApolloSearch(formData());
        setPeople(result.people);
        setTotal(result.total);
      } catch (previewError) {
        setError(
          previewError instanceof Error
            ? previewError.message
            : "Kunde inte söka i Apollo",
        );
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <label className="block text-sm font-medium text-stone-700">
          Målgrupp / titel
          <input
            name="titles"
            value={titles}
            onChange={(event) => setTitles(event.target.value)}
            placeholder="VD, Inköpschef, Founder"
            className="mt-1 h-11 w-full rounded-xl border-0 bg-black/[0.06] px-3 text-[15px] outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {APOLLO_TITLE_PRESETS.map((title) => (
            <Chip
              key={title}
              label={title}
              selected={selectedTitles.some(
                (item) => item.toLocaleLowerCase("sv-SE") === title.toLocaleLowerCase("sv-SE"),
              )}
              onClick={() => setTitles((current) => toggleValue(current, title))}
            />
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <label className="block text-sm font-medium text-stone-700">
          Geografi (person)
          <input
            name="personLocations"
            value={personLocations}
            onChange={(event) => setPersonLocations(event.target.value)}
            placeholder="Sverige, Stockholm"
            className="mt-1 h-11 w-full rounded-xl border-0 bg-black/[0.06] px-3 text-[15px] outline-none"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {APOLLO_LOCATION_PRESETS.map((location) => (
            <Chip
              key={location}
              label={location}
              selected={selectedLocations.some(
                (item) =>
                  item.toLocaleLowerCase("sv-SE") ===
                  location.toLocaleLowerCase("sv-SE"),
              )}
              onClick={() =>
                setPersonLocations((current) => toggleValue(current, location))
              }
            />
          ))}
        </div>
      </div>

      <label className="block text-sm font-medium text-stone-700">
        Företagets huvudkontor
        <input
          name="organizationLocations"
          value={organizationLocations}
          onChange={(event) => setOrganizationLocations(event.target.value)}
          placeholder="Sverige, Norge"
          className="mt-1 h-11 w-full rounded-xl border-0 bg-black/[0.06] px-3 text-[15px] outline-none"
        />
      </label>

      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">Senioritet</p>
        <div className="flex flex-wrap gap-2">
          {APOLLO_SENIORITIES.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={selectedSeniorities.includes(option.value)}
              onClick={() =>
                setSeniorities((current) => toggleValue(current, option.value))
              }
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">Bransch</p>
        <div className="flex flex-wrap gap-2">
          {APOLLO_INDUSTRY_PRESETS.map((industry) => (
            <Chip
              key={industry}
              label={industry}
              selected={selectedIndustries.some(
                (item) =>
                  item.toLocaleLowerCase("sv-SE") ===
                  industry.toLocaleLowerCase("sv-SE"),
              )}
              onClick={() =>
                setIndustries((current) => toggleValue(current, industry))
              }
            />
          ))}
        </div>
      </div>

      <label className="block text-sm font-medium text-stone-700">
        Nyckelord
        <input
          name="keywords"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          placeholder="B2B, SaaS, logistik"
          className="mt-1 h-11 w-full rounded-xl border-0 bg-black/[0.06] px-3 text-[15px] outline-none"
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-sm font-medium text-stone-700">
          Max antal
          <input
            name="limit"
            type="number"
            min={1}
            max={100}
            value={limit}
            onChange={(event) => setLimit(event.target.value)}
            className="mt-1 h-11 w-full rounded-xl border-0 bg-black/[0.06] px-3 text-[15px] outline-none"
          />
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            checked={requirePhone}
            onChange={(event) => setRequirePhone(event.target.checked)}
          />
          Bara personer med telefon
        </label>
        <label className="flex items-center gap-2 text-sm font-medium text-stone-700">
          <input
            type="checkbox"
            checked={includeSimilarTitles}
            onChange={(event) => setIncludeSimilarTitles(event.target.checked)}
          />
          Inkludera liknande titlar
        </label>
      </div>

      {audiences.length > 0 ? (
        <p className="text-sm text-stone-500">
          Sparade målgrupper: {audiences.map((audience) => audience.name).join(", ")}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block flex-1 text-sm font-medium text-stone-700">
          Spara som målgrupp
          <input
            value={audienceName}
            onChange={(event) => setAudienceName(event.target.value)}
            placeholder="VD i Stockholm"
            className="mt-1 h-11 w-full rounded-xl border-0 bg-black/[0.06] px-3 text-[15px] outline-none"
          />
        </label>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await saveApolloAudiencePreset(formData());
              router.refresh();
            })
          }
          className="h-11 rounded-xl px-3 text-sm font-semibold text-[var(--system-blue)]"
        >
          Spara urval
        </button>
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={preview}
          disabled={pending}
          className="flex min-h-11 items-center rounded-xl bg-black/[0.06] px-4 text-sm font-semibold"
        >
          {pending ? "Söker…" : "Förhandsgranska"}
        </button>
        <form action={fetchApolloPhoneList}>
          <input type="hidden" name="titles" value={titles} />
          <input type="hidden" name="seniorities" value={seniorities} />
          <input type="hidden" name="industries" value={industries} />
          <input type="hidden" name="personLocations" value={personLocations} />
          <input
            type="hidden"
            name="organizationLocations"
            value={organizationLocations}
          />
          <input type="hidden" name="keywords" value={keywords} />
          <input
            type="hidden"
            name="includeSimilarTitles"
            value={String(includeSimilarTitles)}
          />
          <input type="hidden" name="requirePhone" value={String(requirePhone)} />
          <input type="hidden" name="limit" value={limit} />
          <input type="hidden" name="name" value={audienceName} />
          <PendingActionButton variant="filled" pendingText="Hämtar nummer…">
            Hämta telefonnummer
          </PendingActionButton>
        </form>
      </div>

      {error ? <p className="text-sm text-[var(--system-red)]">{error}</p> : null}
      {total !== null ? (
        <p className="text-sm font-medium text-stone-600">
          {people.length} visade av {total} träffar
        </p>
      ) : null}
      {people.length > 0 ? (
        <ul className="divide-y divide-black/10 overflow-hidden rounded-[14px] bg-white">
          {people.map((person) => (
            <li key={person.id} className="px-4 py-3">
              <p className="font-semibold">
                {[person.firstName, person.lastName].filter(Boolean).join(" ") ||
                  "Namn doldt"}
              </p>
              <p className="text-sm text-stone-500">
                {[person.title, person.organizationName]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-xs text-stone-400">
                {[person.city, person.country].filter(Boolean).join(", ") ||
                  "Geografi saknas"}
                {person.hasDirectPhone ? " · Telefon finns" : ""}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
