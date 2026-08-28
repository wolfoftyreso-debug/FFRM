import Link from "next/link";
import { format } from "date-fns";
import { listAutomations, displayName } from "@/lib/queries";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { AppleRow, InsetSection } from "@/components/apple-ui";
import { TERMS } from "@/lib/terminology";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.automations };

export default async function AutomationsPage() {
  const rows = await listAutomations();

  return (
    <>
      <PageHeader
        title={TERMS.automations}
        subtitle="Regler som körs åt dig"
        action={<LinkButton href="/automations/new">Ny automation</LinkButton>}
      />
      {rows.length === 0 ? (
        <EmptyState text="No automations yet. Create one to get started." />
      ) : (
        <>
        <div className="md:hidden">
          <InsetSection>
            {rows.map(({ automation, contact }) => (
              <AppleRow
                key={automation.id}
                href={`/automations/${automation.id}`}
                title={<span className="font-semibold">{automation.name}</span>}
                subtitle={`${contact ? displayName(contact) : "Alla kontakter"} · ${automation.triggerType.replaceAll("_", " ")} → ${automation.actionType.replaceAll("_", " ")}`}
                trailing={
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      automation.enabled
                        ? "bg-[var(--system-green)]"
                        : "bg-[var(--system-gray)]"
                    }`}
                  />
                }
              />
            ))}
          </InsetSection>
        </div>
        <div className="hidden md:block">
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-xs uppercase tracking-wide text-stone-400">
                <th className="px-4 py-2.5 font-medium">Namn</th>
                <th className="px-4 py-2.5 font-medium">Kontakt</th>
                <th className="px-4 py-2.5 font-medium">Utlösare</th>
                <th className="px-4 py-2.5 font-medium">Åtgärd</th>
                <th className="px-4 py-2.5 font-medium">Nästa körning</th>
                <th className="px-4 py-2.5 font-medium">Senaste körning</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rows.map(({ automation, contact }) => (
                <tr key={automation.id} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/automations/${automation.id}`}
                      className="font-medium text-stone-900 hover:underline"
                    >
                      {automation.name}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">
                    {contact ? displayName(contact) : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">
                    {automation.triggerType.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">
                    {automation.actionType.replaceAll("_", " ")}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">
                    {automation.nextRunAt
                      ? format(automation.nextRunAt, "d MMM HH:mm")
                      : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">
                    {automation.lastRunAt
                      ? format(automation.lastRunAt, "d MMM HH:mm")
                      : "never"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge
                      label={automation.enabled ? "Aktiv" : "Avstängd"}
                      tone={automation.enabled ? "positive" : "neutral"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
        </>
      )}
    </>
  );
}
