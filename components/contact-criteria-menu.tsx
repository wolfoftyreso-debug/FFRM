"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, ListFilter, X } from "lucide-react";

export const CONTACT_FILTER_GROUPS = [
  {
    title: "Relation",
    items: [
      { id: "all", label: "Alla kontakter" },
      { id: "family", label: "Familj" },
      { id: "friend", label: "Vänner" },
      { id: "work", label: "Arbete" },
    ],
  },
  {
    title: "Fokus",
    items: [
      { id: "important", label: "Viktiga" },
      { id: "birthday-soon", label: "Snart födelsedag" },
      { id: "needs-attention", label: "Behöver uppmärksamhet" },
    ],
  },
] as const;

type ContactFilterItem = (typeof CONTACT_FILTER_GROUPS)[number]["items"][number];

const ALL_FILTERS: ContactFilterItem[] = CONTACT_FILTER_GROUPS.flatMap(
  (group) => [...group.items],
);

export function contactFilterLabel(id: string) {
  return ALL_FILTERS.find((item) => item.id === id)?.label ?? "Alla kontakter";
}

function hrefFor(filter: string, sort: string, query: string) {
  const params = new URLSearchParams();
  if (filter && filter !== "all") params.set("filter", filter);
  if (sort && sort !== "name") params.set("sort", sort);
  if (query) params.set("q", query);
  const search = params.toString();
  return search ? `/people?${search}` : "/people";
}

export function ContactCriteriaMenu({
  filter,
  sort,
  query,
}: {
  filter: string;
  sort: string;
  query: string;
}) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const current = contactFilterLabel(filter);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <div className="mb-3">
      <div className="flex h-11 items-center gap-1 rounded-xl bg-white px-1 shadow-[0_0.5px_1px_rgba(0,0,0,0.04)]">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Show contacts: ${current}`}
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-xl px-2 text-left"
        >
          <ListFilter className="h-4 w-4 shrink-0 text-[var(--system-blue)]" />
          <span className="min-w-0 flex-1 truncate text-[15px] font-medium">
            {current}
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-[var(--system-gray)]" />
        </button>
        {filter !== "all" ? (
          <Link
            href={hrefFor("all", sort, query)}
            aria-label="Rensa kontaktfiltret"
            className="shrink-0 px-2 text-[13px] font-semibold text-[var(--system-blue)]"
          >
            Rensa
          </Link>
        ) : null}
      </div>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Stäng sökvillkoren"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="ios-safe-bottom absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[20px] bg-[var(--system-gray-6)] px-4 pt-3 md:inset-auto md:bottom-auto md:left-1/2 md:top-1/2 md:w-[390px] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-[20px] md:pb-4"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 id={titleId} className="text-[17px] font-semibold">
                Visa
              </h2>
              <button
                type="button"
                aria-label="Stäng"
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-[var(--system-blue)]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 pb-4">
              {CONTACT_FILTER_GROUPS.map((group) => (
                <section key={group.title}>
                  <h3 className="mb-1.5 px-4 text-[13px] font-normal uppercase tracking-wide text-[var(--secondary-label)]">
                    {group.title}
                  </h3>
                  <div className="ios-inset-group">
                    {group.items.map((item) => {
                      const selected = filter === item.id;
                      return (
                        <Link
                          key={item.id}
                          href={hrefFor(item.id, sort, query)}
                          aria-current={selected ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className="ios-hairline flex min-h-14 items-center justify-between px-4 text-[17px] hover:bg-black/[0.035] active:bg-black/[0.07]"
                        >
                          {item.label}
                          {selected ? (
                            <Check className="h-5 w-5 text-[var(--system-blue)]" />
                          ) : (
                            <span className="h-5 w-5" />
                          )}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
