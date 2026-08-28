import Link from "next/link";
import { format } from "date-fns";
import { listActivity, displayName } from "@/lib/queries";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { TERMS } from "@/lib/terminology";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.activity };

export default async function ActivityPage() {
  const rows = await listActivity(150);

  return (
    <>
      <PageHeader title={TERMS.activity} subtitle="Allt systemet har gjort" />
      {rows.length === 0 ? (
        <EmptyState text="No activity yet." />
      ) : (
        <Card className="divide-y divide-stone-100 p-0">
          {rows.map(({ entry, contact }) => (
            <div key={entry.id} className="px-4 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 truncate text-sm text-stone-800">
                  {entry.summary}
                </p>
                <Badge label={entry.actor} />
              </div>
              <p className="mt-0.5 text-xs text-stone-400">
                {format(entry.createdAt, "d MMM yyyy HH:mm:ss")}
                {" · "}
                {entry.action.replaceAll("_", " ").toLowerCase()}
                {contact ? (
                  <>
                    {" · "}
                    <Link
                      href={`/people/${contact.id}`}
                      className="hover:underline"
                    >
                      {displayName(contact)}
                    </Link>
                  </>
                ) : null}
                {entry.conversationId ? (
                  <>
                    {" · "}
                    <Link
                      href={`/messages/${entry.conversationId}`}
                      className="hover:underline"
                    >
                      conversation
                    </Link>
                  </>
                ) : null}
              </p>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
