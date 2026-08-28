import { notFound } from "next/navigation";
import { format } from "date-fns";
import { AppleRow, InsetSection } from "@/components/apple-ui";
import { Badge, Card, PageHeader } from "@/components/ui";
import { getApolloListDetail } from "@/lib/apollo/service";
import { describeApolloFilters } from "@/lib/apollo/filters";
import {
  importApolloContacts,
  refreshApolloPhoneList,
} from "@/app/actions";
import { PendingActionButton } from "@/components/pending-action-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apollo-lista" };

export default async function ApolloListPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getApolloListDetail(id);
  if (!detail) notFound();
  const { list, prospects } = detail;
  const ready = prospects.filter((prospect) => prospect.phoneNumber);

  return (
    <>
      <PageHeader
        title={list.name}
        subtitle={describeApolloFilters(list.filters)}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3">
          <Badge label={list.status} />
          <p className="text-sm text-stone-500">
            {list.phoneCount} nummer · {list.totalFound} träffar ·{" "}
            {format(list.createdAt, "d MMM HH:mm")}
          </p>
        </div>
        {list.lastError ? (
          <p className="mt-3 text-sm text-[var(--system-red)]">{list.lastError}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-3">
          <form action={refreshApolloPhoneList.bind(null, list.id)}>
            <PendingActionButton pendingText="Uppdaterar…">
              Uppdatera nummer
            </PendingActionButton>
          </form>
          {ready.length > 0 ? (
            <form action={importApolloContacts.bind(null, list.id)}>
              <PendingActionButton
                variant="filled"
                pendingText="Importerar…"
              >
                Importera {ready.length} kontakter
              </PendingActionButton>
            </form>
          ) : null}
        </div>
      </Card>
      <div className="mt-6">
        <InsetSection title="Personer">
          {prospects.map((prospect) => (
            <AppleRow
              key={prospect.id}
              href={prospect.contactId ? `/people/${prospect.contactId}` : undefined}
              title={
                [prospect.firstName, prospect.lastName].filter(Boolean).join(" ") ||
                "Namn doldt"
              }
              subtitle={[
                prospect.title,
                prospect.organizationName,
                [prospect.city, prospect.country].filter(Boolean).join(", "),
                prospect.phoneNumber,
              ]
                .filter(Boolean)
                .join(" · ")}
              trailing={<Badge label={prospect.status} />}
            />
          ))}
        </InsetSection>
      </div>
    </>
  );
}
