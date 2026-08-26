import { formatDistanceToNow } from "date-fns";
import { searchContacts, displayName } from "@/lib/queries";
import Link from "next/link";
import {
  AppleRow,
  ContactAvatar,
  InsetSection,
  SegmentedLinks,
} from "@/components/apple-ui";
import { Plus, Search } from "lucide-react";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

const FILTERS = [
  { id: "all", label: "All" },
  { id: "family", label: "Family" },
  { id: "friend", label: "Friends" },
  { id: "work", label: "Work" },
  { id: "important", label: "Important" },
  { id: "birthday-soon", label: "Birthday soon" },
  { id: "needs-attention", label: "Needs attention" },
];

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; filter?: string; sort?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const filter = params.filter ?? "all";
  const sort = params.sort ?? "name";
  const searchSuffix = q ? `&q=${encodeURIComponent(q)}` : "";
  const contacts = await searchContacts(q, filter);
  contacts.sort((a, b) => {
    if (sort === "recent") {
      return (
        (b.lastInteractionAt?.getTime() ?? 0) -
        (a.lastInteractionAt?.getTime() ?? 0)
      );
    }
    if (sort === "importance") {
      const rank: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
      return rank[a.importance] - rank[b.importance] ||
        displayName(a).localeCompare(displayName(b));
    }
    return displayName(a).localeCompare(displayName(b));
  });
  const grouped = Object.groupBy(contacts, (c) =>
    displayName(c).charAt(0).toUpperCase(),
  );

  return (
    <>
      <div className="mb-4 flex items-end justify-between">
        <div>
          <p className="text-sm font-medium text-[var(--system-blue)]">
            {contacts.length} contacts
          </p>
          <h1 className="text-[34px] font-bold tracking-tight">Contacts</h1>
        </div>
        <Link
          href="/people/new"
          aria-label="Add contact"
          className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--system-blue)]"
        >
          <Plus className="h-7 w-7" />
        </Link>
      </div>

      <form method="get" className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--system-gray)]" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          aria-label="Search contacts"
          placeholder="Search"
          className="h-9 w-full rounded-xl border-0 bg-black/[0.06] pl-9 pr-3 text-[15px] outline-none"
        />
        <input type="hidden" name="filter" value={filter} />
        <input type="hidden" name="sort" value={sort} />
      </form>

      <div className="mb-3 overflow-x-auto pb-1">
        <div className="flex min-w-max gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/people?filter=${f.id}&sort=${sort}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`flex min-h-8 items-center rounded-full px-3 text-[13px] font-medium ${
              filter === f.id
                ? "bg-[var(--system-blue)] text-white"
                : "bg-white text-[var(--secondary-label)]"
            }`}
          >
            {f.label}
          </Link>
        ))}
        </div>
      </div>
      <div className="mb-5">
        <SegmentedLinks
          active={sort}
          items={[
            { id: "name", label: "Name", href: `/people?filter=${filter}&sort=name${searchSuffix}` },
            { id: "recent", label: "Recent", href: `/people?filter=${filter}&sort=recent${searchSuffix}` },
            {
              id: "importance",
              label: "Priority",
              href: `/people?filter=${filter}&sort=importance${searchSuffix}`,
            },
          ]}
        />
      </div>

      {contacts.length === 0 ? (
        <div className="ios-inset-group px-6 py-12 text-center text-[var(--secondary-label)]">
          No contacts found.
        </div>
      ) : (
        <div className="space-y-5">
          {Object.entries(grouped)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([letter, rows]) => (
              <InsetSection key={letter} title={letter}>
                {(rows ?? []).map((c) => (
                  <AppleRow
                    key={c.id}
                    href={`/people/${c.id}`}
                    leading={<ContactAvatar name={displayName(c)} />}
                    title={
                      <span className="font-semibold">
                        {displayName(c)}
                        {c.importance === "HIGH" ? (
                          <span className="ml-2 text-[11px] font-bold text-[var(--system-orange)]">
                            PRIORITY
                          </span>
                        ) : null}
                      </span>
                    }
                    subtitle={`${c.relationshipLabel ?? c.relationshipType}${
                      c.lastInteractionAt
                        ? ` · ${formatDistanceToNow(c.lastInteractionAt, { addSuffix: true })}`
                        : " · No history"
                    }`}
                  />
                ))}
              </InsetSection>
            ))}
        </div>
      )}
    </>
  );
}
