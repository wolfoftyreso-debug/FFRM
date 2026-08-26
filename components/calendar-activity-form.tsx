"use client";

import { useMemo, useState } from "react";
import type { Automation, Contact } from "@/lib/db/schema";
import {
  CALENDAR_ACTIVITY_OPTIONS,
  calendarActivityOption,
  type CalendarActivityKind,
} from "@/lib/calendar-activities";
import { inputClass, labelClass } from "@/components/ui";

type ContactOption = Pick<
  Contact,
  "id" | "firstName" | "lastName" | "birthday" | "nameDayMonth" | "nameDayDay"
>;

export function CalendarActivityForm({
  contacts,
  automation,
}: {
  contacts: ContactOption[];
  automation?: Automation | null;
}) {
  const config = automation?.triggerConfig ?? {};
  const initialKind =
    (config.eventKind as CalendarActivityKind | undefined) ?? "BIRTHDAY";
  const [kind, setKind] = useState<CalendarActivityKind>(initialKind);
  const [contactId, setContactId] = useState(automation?.contactId ?? "");
  const [date, setDate] = useState(config.date ?? suggestedDate(initialKind));
  const [recurring, setRecurring] = useState(config.yearly !== false);
  const [randomMinute, setRandomMinute] = useState(
    config.randomMinute ?? true,
  );
  const selectedContact = useMemo(
    () => contacts.find((contact) => contact.id === contactId),
    [contacts, contactId],
  );

  function chooseKind(nextKind: CalendarActivityKind) {
    setKind(nextKind);
    const option = calendarActivityOption(nextKind);
    setRecurring(option.recurringByDefault);
    setDate(contactDate(nextKind, selectedContact) ?? suggestedDate(nextKind));
  }

  function chooseContact(nextId: string) {
    setContactId(nextId);
    const contact = contacts.find((item) => item.id === nextId);
    const nextDate = contactDate(kind, contact);
    if (nextDate) setDate(nextDate);
  }

  return (
    <div className="space-y-5">
      <label className={labelClass}>
        Aktivitet
        <select
          name="eventKind"
          value={kind}
          onChange={(event) =>
            chooseKind(event.target.value as CalendarActivityKind)
          }
          className={inputClass}
        >
          {CALENDAR_ACTIVITY_OPTIONS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Kontakt
        <select
          name="contactId"
          required
          value={contactId}
          onChange={(event) => chooseContact(event.target.value)}
          className={inputClass}
        >
          <option value="">Välj kontakt…</option>
          {contacts.map((contact) => (
            <option key={contact.id} value={contact.id}>
              {contact.firstName} {contact.lastName ?? ""}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClass}>
        Rubrik
        <input
          name="title"
          defaultValue={automation?.name ?? ""}
          placeholder={`${calendarActivityOption(kind).label} – kontaktens namn`}
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Datum
          <input
            name="date"
            type="date"
            required
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Klockslag
          <input
            name="time"
            type="time"
            required
            defaultValue={config.time ?? "09:00"}
            className={inputClass}
          />
        </label>
      </div>

      <ToggleRow
        name="recurring"
        checked={recurring}
        onChange={setRecurring}
        title="Återkommande varje år"
        subtitle="Aktiviteten flyttas automatiskt till nästa år efter körning."
      />
      <ToggleRow
        name="randomMinute"
        checked={randomMinute}
        onChange={setRandomMinute}
        title="Slumpmässig minut"
        subtitle="Behåller vald timme men varierar minuten varje år."
      />

      <label className={labelClass}>
        Önskemål till AI-utkastet
        <textarea
          name="instruction"
          rows={3}
          defaultValue={automation?.actionConfig?.instruction ?? ""}
          placeholder="Exempel: varmt och kort, nämn gärna vår resa om det passar."
          className={inputClass}
        />
      </label>

      <div className="rounded-2xl bg-blue-50 px-4 py-3 text-sm text-blue-800">
        AI skapar ett personligt SMS-utkast när aktiviteten inträffar. Utkastet
        väntar på ditt godkännande innan det skickas.
      </div>
    </div>
  );
}

function ToggleRow({
  name,
  checked,
  onChange,
  title,
  subtitle,
}: {
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: string;
  subtitle: string;
}) {
  return (
    <label className="flex min-h-16 items-center justify-between gap-4 rounded-2xl bg-white px-4 py-3">
      <span>
        <span className="block text-[16px] font-medium">{title}</span>
        <span className="block text-xs text-[var(--secondary-label)]">
          {subtitle}
        </span>
      </span>
      <input
        type="checkbox"
        name={name}
        value="1"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-7 w-12 accent-[var(--system-green)]"
      />
    </label>
  );
}

function suggestedDate(kind: CalendarActivityKind): string {
  const year = new Date().getFullYear();
  const fixed = calendarActivityOption(kind).fixedMonthDay;
  return fixed ? `${year}-${fixed}` : "";
}

function contactDate(
  kind: CalendarActivityKind,
  contact?: ContactOption,
): string | null {
  if (!contact) return null;
  if (kind === "BIRTHDAY" && contact.birthday) return contact.birthday;
  if (kind === "NAME_DAY" && contact.nameDayMonth && contact.nameDayDay) {
    const year = new Date().getFullYear();
    return `${year}-${String(contact.nameDayMonth).padStart(2, "0")}-${String(
      contact.nameDayDay,
    ).padStart(2, "0")}`;
  }
  return null;
}
