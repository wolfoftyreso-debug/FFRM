import Link from "next/link";
import { addMonths, format, startOfMonth, endOfMonth } from "date-fns";
import { getCalendarItems } from "@/lib/queries";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { addReminder } from "@/app/actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;
  const base = params.month ? new Date(`${params.month}-01T00:00:00`) : new Date();
  const rangeStart = startOfMonth(base);
  const rangeEnd = endOfMonth(base);
  const items = await getCalendarItems(rangeStart, rangeEnd);

  const prev = format(addMonths(base, -1), "yyyy-MM");
  const next = format(addMonths(base, 1), "yyyy-MM");

  const byDay = new Map<string, typeof items>();
  for (const item of items) {
    const key = format(item.at, "yyyy-MM-dd");
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key)!.push(item);
  }

  return (
    <>
      <PageHeader
        title="Calendar"
        subtitle={format(base, "MMMM yyyy")}
        action={
          <div className="flex gap-2">
            <Link
              href={`/calendar?month=${prev}`}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
            >
              ←
            </Link>
            <Link
              href={`/calendar?month=${next}`}
              className="rounded-md border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50"
            >
              →
            </Link>
          </div>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 text-xs text-stone-500">
        <span className="flex items-center gap-1">
          <Badge label="AUTOMATIC" /> the system will do this
        </span>
        <span className="flex items-center gap-1">
          <Badge label="HUMAN" /> you need to do this
        </span>
        <span className="flex items-center gap-1">
          <Badge label="COMPLETED" /> already performed
        </span>
        <span className="flex items-center gap-1">
          <Badge label="ESCALATED" /> requires you
        </span>
      </div>

      <details className="ios-inset-group mb-5 px-4 py-3">
        <summary className="cursor-pointer text-[15px] font-semibold text-[var(--system-blue)]">
          Add reminder
        </summary>
        <form action={addReminder.bind(null, null)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_220px_auto]">
          <input
            name="title"
            required
            placeholder="What should I remember?"
            className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
          <input
            name="dueAt"
            type="datetime-local"
            className="h-11 rounded-xl border border-black/10 bg-white px-3 text-sm"
          />
          <button className="rounded-xl bg-[var(--system-blue)] px-4 text-sm font-semibold text-white">
            Save
          </button>
        </form>
      </details>

      {byDay.size === 0 ? (
        <EmptyState text="Nothing this month." />
      ) : (
        <div className="space-y-4">
          {[...byDay.entries()].map(([day, dayItems]) => (
            <div key={day}>
              <h2 className="mb-1.5 text-sm font-semibold text-stone-700">
                {format(new Date(`${day}T12:00:00`), "EEEE d MMMM")}
              </h2>
              <Card className="divide-y divide-stone-100 p-0">
                {dayItems.map((item, i) => {
                  const inner = (
                    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{item.title}</p>
                        <p className="text-xs text-stone-400">
                          {format(item.at, "HH:mm")}
                          {item.contactName ? ` · ${item.contactName}` : ""}
                          {item.status ? ` · ${item.status}` : ""}
                        </p>
                      </div>
                      <Badge label={item.kind} />
                    </div>
                  );
                  return item.detailUrl ? (
                    <Link
                      key={i}
                      href={item.detailUrl}
                      className="block hover:bg-stone-50"
                    >
                      {inner}
                    </Link>
                  ) : (
                    <div key={i}>{inner}</div>
                  );
                })}
              </Card>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
