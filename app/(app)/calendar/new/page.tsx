import { createCalendarActivity } from "@/app/actions";
import { CalendarActivityForm } from "@/components/calendar-activity-form";
import { Card, PageHeader } from "@/components/ui";
import { listContacts } from "@/lib/queries";

export const dynamic = "force-dynamic";
export const metadata = { title: "Ny aktivitet" };

export default async function NewCalendarActivityPage() {
  const contacts = (await listContacts()).filter(
    (contact) => contact.phoneNumber,
  );
  return (
    <>
      <PageHeader
        title="Ny aktivitet"
        subtitle="Välj högtid, person, datum och när AI ska skapa SMS-utkastet."
      />
      <Card>
        <form action={createCalendarActivity}>
          <CalendarActivityForm contacts={contacts} />
          <button className="mt-6 min-h-14 w-full rounded-2xl bg-[var(--system-blue)] text-[17px] font-semibold text-white">
            Spara aktivitet
          </button>
        </form>
      </Card>
    </>
  );
}
