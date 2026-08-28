import { addTask } from "@/app/actions";
import { listTickets } from "@/lib/review";
import { listContacts } from "@/lib/queries";
import { completeReminder, dismissReminder } from "@/app/actions";
import { AppleRow, InsetSection, SegmentedLinks } from "@/components/apple-ui";
import { PageHeader, PrimaryButton, inputClass } from "@/components/ui";
import { TERMS } from "@/lib/terminology";

export const dynamic = "force-dynamic";
export const metadata = { title: TERMS.tasks };

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const view = (await searchParams).view === "done" ? "done" : "open";
  const [tickets, contacts] = await Promise.all([
    listTickets(view),
    listContacts(),
  ]);

  return (
    <>
      <PageHeader title={TERMS.tasks} subtitle="En enkel lista. Inga extra tavlor." />
      <div className="mb-5">
        <SegmentedLinks
          active={view}
          items={[
            { id: "open", label: "Öppna", href: "/tasks?view=open" },
            { id: "done", label: "Klara", href: "/tasks?view=done" },
          ]}
        />
      </div>
      <form
        action={addTask}
        className="mb-6 space-y-3 rounded-2xl bg-white p-4"
      >
        <input
          name="title"
          required
          placeholder="Ny uppgift"
          className={inputClass}
        />
        <div className="grid gap-2 sm:grid-cols-2">
          <select name="contactId" className={inputClass}>
            <option value="">Ingen kontakt</option>
            {contacts.map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.firstName}
              </option>
            ))}
          </select>
          <input name="dueAt" type="datetime-local" className={inputClass} />
        </div>
        <PrimaryButton>Lägg till uppgift</PrimaryButton>
      </form>
      <InsetSection>
        {tickets.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[var(--secondary-label)]">
            Inga uppgifter här.
          </p>
        ) : (
          tickets.map(({ ticket, contact }) => (
            <div key={ticket.id} className="ios-hairline px-4 py-3">
              <AppleRow
                title={ticket.title}
                subtitle={[
                  contact?.firstName,
                  ticket.dueAt
                    ? ticket.dueAt.toLocaleString("sv-SE")
                    : null,
                  ticket.priority,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {view === "open" ? (
                <div className="mt-2 flex gap-3">
                  <form action={completeReminder.bind(null, ticket.id)}>
                    <button className="text-sm font-semibold text-[var(--system-green)]">
                      Klar
                    </button>
                  </form>
                  <form action={dismissReminder.bind(null, ticket.id)}>
                    <button className="text-sm font-semibold text-[var(--system-red)]">
                      Avfärda
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          ))
        )}
      </InsetSection>
    </>
  );
}
