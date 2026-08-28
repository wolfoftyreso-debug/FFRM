import { notFound } from "next/navigation";
import {
  deleteCalendarActivity,
  toggleAutomation,
  updateCalendarActivity,
} from "@/app/actions";
import { CalendarActivityForm } from "@/components/calendar-activity-form";
import { ConfirmForm } from "@/components/confirm-form";
import { Badge, Card, PageHeader, SecondaryButton } from "@/components/ui";
import { isCalendarSmsJob } from "@/lib/calendar-activities";
import { displayName, getAutomationDetail, listContacts } from "@/lib/queries";
import { defaultTimezone } from "@/lib/env";
import { executionStatusLabel } from "@/lib/terminology";

export const dynamic = "force-dynamic";

export default async function CalendarActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [detail, contacts] = await Promise.all([
    getAutomationDetail(id),
    listContacts(),
  ]);
  if (!detail || !isCalendarSmsJob(detail.automation)) {
    notFound();
  }
  const { automation, contact, executions } = detail;

  return (
    <>
      <PageHeader
        title={automation.name}
        subtitle={[
          contact ? displayName(contact) : null,
          automation.nextRunAt
            ? `Nästa ${formatActivityTime(
                automation.nextRunAt,
                contact?.timezone ?? defaultTimezone(),
              )}`
            : "Ingen kommande körning",
        ]
          .filter(Boolean)
          .join(" · ")}
        action={
          <Badge
            label={automation.enabled ? "Aktiv" : "Avstängd"}
            tone={automation.enabled ? "positive" : "neutral"}
          />
        }
      />

      <div className="mb-5 flex flex-wrap gap-2">
        <form action={toggleAutomation.bind(null, automation.id)}>
          <SecondaryButton>
            {automation.enabled ? "Pausa" : "Aktivera"}
          </SecondaryButton>
        </form>
        <ConfirmForm
          action={deleteCalendarActivity.bind(null, automation.id)}
          label="Ta bort"
          confirmText={`Ta bort "${automation.name}" och hela historiken?`}
        />
      </div>

      <Card>
        <form action={updateCalendarActivity.bind(null, automation.id)}>
          <CalendarActivityForm
            contacts={contacts.filter((item) => item.phoneNumber)}
            automation={automation}
          />
          <button className="mt-6 min-h-14 w-full rounded-2xl bg-[var(--system-blue)] text-[17px] font-semibold text-white">
            Spara ändringar
          </button>
        </form>
      </Card>

      {executions.length > 0 ? (
        <Card className="mt-6">
          <h2 className="mb-3 text-sm font-semibold">Historik</h2>
          <div className="divide-y divide-black/[0.06]">
            {executions.slice(0, 10).map((execution) => (
              <div
                key={execution.id}
                className="flex min-h-12 items-center justify-between gap-3"
              >
                <span className="text-sm">
                  {formatActivityTime(
                    execution.scheduledFor,
                    contact?.timezone ?? defaultTimezone(),
                  )}
                </span>
                <Badge {...executionStatusLabel(execution.status)} />
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </>
  );
}

function formatActivityTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
