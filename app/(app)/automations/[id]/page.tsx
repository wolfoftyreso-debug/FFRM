import { notFound } from "next/navigation";
import { format } from "date-fns";
import { getAutomationDetail, listContacts, displayName } from "@/lib/queries";
import {
  deleteAutomation,
  runAutomationNow,
  skipNextOccurrence,
  toggleAutomation,
  updateAutomation,
} from "@/app/actions";
import { Badge, Card, PageHeader, PrimaryButton, SecondaryButton } from "@/components/ui";
import { AutomationFormFields } from "@/components/automation-form";
import { ConfirmForm } from "@/components/confirm-form";

export const dynamic = "force-dynamic";

export default async function AutomationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detail = await getAutomationDetail(id);
  if (!detail) notFound();
  const { automation, contact, executions } = detail;
  const contacts = await listContacts();

  return (
    <>
      <PageHeader
        title={automation.name}
        subtitle={[
          contact ? `for ${displayName(contact)}` : null,
          automation.nextRunAt
            ? `next run ${format(automation.nextRunAt, "d MMM yyyy HH:mm")}`
            : "no scheduled run",
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Badge label={automation.enabled ? "ENABLED" : "DISABLED"} />
        }
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <form action={runAutomationNow.bind(null, automation.id)}>
          <PrimaryButton>Run now</PrimaryButton>
        </form>
        {automation.nextRunAt ? (
          <form action={skipNextOccurrence.bind(null, automation.id)}>
            <SecondaryButton>Skip once</SecondaryButton>
          </form>
        ) : null}
        <form action={toggleAutomation.bind(null, automation.id)}>
          <SecondaryButton>
            {automation.enabled ? "Disable" : "Enable"}
          </SecondaryButton>
        </form>
        <ConfirmForm
          action={deleteAutomation.bind(null, automation.id)}
          label="Delete"
          confirmText={`Delete automation "${automation.name}" and its execution history?`}
        />
      </div>

      <div className="space-y-6">
        <Card>
          <h2 className="mb-4 text-sm font-semibold text-stone-700">
            Configuration
          </h2>
          <form action={updateAutomation.bind(null, automation.id)}>
            <AutomationFormFields automation={automation} contacts={contacts} />
            <div className="mt-6">
              <PrimaryButton>Save changes</PrimaryButton>
            </div>
          </form>
        </Card>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-stone-700">
            Execution history
          </h2>
          {executions.length === 0 ? (
            <Card>
              <p className="py-4 text-center text-sm text-stone-400">
                Never executed.
              </p>
            </Card>
          ) : (
            <Card className="divide-y divide-stone-100 p-0">
              {executions.map((e) => (
                <div key={e.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm text-stone-700">
                      {format(e.scheduledFor, "d MMM yyyy HH:mm")}
                      <span className="ml-2 text-xs text-stone-400">
                        {e.occurrenceKey}
                      </span>
                    </p>
                    <Badge label={e.status} />
                  </div>
                  {e.result != null || e.error || e.decision != null ? (
                    <div className="mt-1.5 space-y-1 text-xs text-stone-500">
                      {e.error ? (
                        <p className="text-red-600">Error: {e.error}</p>
                      ) : null}
                      {e.decision != null ? (
                        <p>Decision: {JSON.stringify(e.decision)}</p>
                      ) : null}
                      {e.result != null ? (
                        <p>Result: {JSON.stringify(e.result)}</p>
                      ) : null}
                      {e.aiModel ? (
                        <p>
                          AI: {e.aiModel} ({e.aiInputTokens ?? "?"} in /{" "}
                          {e.aiOutputTokens ?? "?"} out tokens)
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </Card>
          )}
        </section>
      </div>
    </>
  );
}
