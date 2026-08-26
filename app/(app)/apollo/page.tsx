import Link from "next/link";
import { AppleRow, InsetSection } from "@/components/apple-ui";
import { ApolloSearchForm } from "@/components/apollo-search";
import { Badge, Card, PageHeader } from "@/components/ui";
import {
  defaultFiltersFromConfig,
  getApolloPublicConfig,
} from "@/lib/apollo/config";
import { joinCsvList } from "@/lib/apollo/filters";
import { listApolloAudiences, listApolloLists } from "@/lib/apollo/service";
import { getProviderStatus } from "@/lib/providers/config";
import { deleteApolloAudiencePreset } from "@/app/actions";
import { ConfirmForm } from "@/components/confirm-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apollo" };

export default async function ApolloPage() {
  const [providers, config, audiences, lists] = await Promise.all([
    getProviderStatus(),
    getApolloPublicConfig(),
    listApolloAudiences(),
    listApolloLists(8),
  ]);
  const filters = defaultFiltersFromConfig(config);
  const configured = Boolean(providers.apollo?.configured);

  return (
    <>
      <PageHeader
        title="Apollo"
        subtitle="Hämta telefonnummer för målgrupper och geografiskt urval."
      />
      {!configured ? (
        <Card>
          <p className="text-sm text-stone-600">
            Lägg in Apollo API-nyckel och standardsök under Inställningar.
          </p>
          <Link
            href="/settings?section=integrations"
            className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-[var(--system-blue)]"
          >
            Öppna Apollo-inställningar
          </Link>
        </Card>
      ) : (
        <Card>
          <ApolloSearchForm
            defaults={{
              titles: joinCsvList(filters.titles),
              seniorities: joinCsvList(filters.seniorities),
              industries: joinCsvList(filters.industries),
              personLocations: joinCsvList(filters.personLocations),
              organizationLocations: joinCsvList(filters.organizationLocations),
              keywords: filters.keywords,
              includeSimilarTitles: filters.includeSimilarTitles,
              requirePhone: filters.requirePhone,
              limit: filters.limit,
            }}
            audiences={audiences.map((audience) => ({
              id: audience.id,
              name: audience.name,
            }))}
          />
        </Card>
      )}

      {audiences.length > 0 ? (
        <div className="mt-8">
          <InsetSection title="Sparade målgrupper">
            {audiences.map((audience) => (
              <AppleRow
                key={audience.id}
                title={audience.name}
                subtitle={[
                  audience.filters.titles.join(", "),
                  audience.filters.personLocations.join(", "),
                ]
                  .filter(Boolean)
                  .join(" · ")}
                trailing={
                  <ConfirmForm
                    action={deleteApolloAudiencePreset.bind(null, audience.id)}
                    label="Ta bort"
                    confirmText="Ta bort den sparade målgruppen?"
                  />
                }
              />
            ))}
          </InsetSection>
        </div>
      ) : null}

      {lists.length > 0 ? (
        <div className="mt-8">
          <InsetSection title="Hämtade listor">
            {lists.map((list) => (
              <AppleRow
                key={list.id}
                href={`/apollo/${list.id}`}
                title={list.name}
                subtitle={`${list.phoneCount} nummer · ${list.totalFound} träffar`}
                trailing={<Badge label={list.status} />}
              />
            ))}
          </InsetSection>
        </div>
      ) : null}
    </>
  );
}
