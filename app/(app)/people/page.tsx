import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { searchContacts, displayName } from "@/lib/queries";
import { Badge, Card, EmptyState, LinkButton, PageHeader } from "@/components/ui";

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
  searchParams: Promise<{ q?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const q = params.q ?? "";
  const filter = params.filter ?? "all";
  const contacts = await searchContacts(q, filter);

  return (
    <>
      <PageHeader
        title="People"
        subtitle={`${contacts.length} contact${contacts.length === 1 ? "" : "s"}`}
        action={<LinkButton href="/people/new">Add contact</LinkButton>}
      />

      <form method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search people…"
          className="w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-sm focus:border-stone-500 focus:outline-none"
        />
        {filter !== "all" ? (
          <input type="hidden" name="filter" value={filter} />
        ) : null}
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.id}
            href={`/people?filter=${f.id}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium ${
              filter === f.id
                ? "border-stone-900 bg-stone-900 text-white"
                : "border-stone-300 bg-white text-stone-600 hover:bg-stone-50"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {contacts.length === 0 ? (
        <EmptyState text="No contacts found." />
      ) : (
        <div className="space-y-2">
          {contacts.map((c) => (
            <Link key={c.id} href={`/people/${c.id}`} className="block">
              <Card className="flex items-center justify-between gap-3 hover:border-stone-300">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{displayName(c)}</p>
                  <p className="text-xs text-stone-400">
                    {c.relationshipType.charAt(0) +
                      c.relationshipType.slice(1).toLowerCase()}
                    {c.phoneNumber ? ` · ${c.phoneNumber}` : ""}
                    {c.lastInteractionAt
                      ? ` · last contact ${formatDistanceToNow(c.lastInteractionAt, { addSuffix: true })}`
                      : " · never contacted"}
                  </p>
                </div>
                {c.importance === "HIGH" ? <Badge label="IMPORTANT" /> : null}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
