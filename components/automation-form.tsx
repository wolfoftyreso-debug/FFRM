"use client";

import type { Automation, Contact } from "@/lib/db/schema";
import { inputClass, labelClass } from "@/components/ui";
import { AUTONOMY_LABELS } from "@/lib/autonomy";
import { useState } from "react";

const TRIGGERS = [
  { id: "BIRTHDAY", label: "På kontaktens födelsedag" },
  { id: "NAME_DAY", label: "På kontaktens namnsdag" },
  { id: "ANNIVERSARY", label: "On an anniversary (yearly date)" },
  { id: "DATE", label: "On a specific date (once)" },
  { id: "INTERVAL", label: "Every N days" },
  { id: "NO_CONTACT_FOR", label: "När ni inte haft kontakt på N dagar" },
  { id: "INCOMING_SMS", label: "När ett SMS kommer in" },
  { id: "MANUAL", label: "Manuellt (körs från den här sidan)" },
  { id: "CRON", label: "Advanced: cron expression" },
];

const ACTIONS = [
  { id: "GENERATE_SMS", label: "Skapa ett personligt SMS med AI" },
  { id: "SEND_SMS", label: "Send a fixed SMS text" },
  { id: "REMIND_USER", label: "Remind me" },
  { id: "AI_EVALUATE", label: "AI: evaluate whether I should reach out" },
  { id: "CREATE_TASK", label: "Create a task" },
  { id: "CREATE_CALENDAR_EVENT", label: "Create a calendar event" },
  { id: "ESCALATE", label: "Escalate to me" },
  { id: "UPDATE_CONTACT", label: "Update a contact field" },
  { id: "LOG_EVENT", label: "Log an event" },
];

export function AutomationFormFields({
  automation,
  contacts,
  defaultContactId,
  defaultTriggerType,
}: {
  automation?: Automation | null;
  contacts: Contact[];
  defaultContactId?: string;
  defaultTriggerType?: Automation["triggerType"];
}) {
  const tc = automation?.triggerConfig ?? {};
  const ac = automation?.actionConfig ?? {};
  const [triggerType, setTriggerType] = useState(
    automation?.triggerType ?? defaultTriggerType ?? "BIRTHDAY",
  );
  const [actionType, setActionType] = useState(
    automation?.actionType ?? "GENERATE_SMS",
  );
  return (
    <div className="space-y-4">
      <label className={labelClass}>
        Name *
        <input
          name="name"
          required
          placeholder="Johans födelsedagshälsning"
          defaultValue={automation?.name ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Beskrivning
        <input
          name="description"
          defaultValue={automation?.description ?? ""}
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          När (utlösare)
          <select
            name="triggerType"
            value={triggerType}
            onChange={(event) =>
              setTriggerType(event.target.value as Automation["triggerType"])
            }
            className={inputClass}
          >
            {TRIGGERS.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Kontakt
          <select
            name="contactId"
            defaultValue={automation?.contactId ?? defaultContactId ?? ""}
            className={inputClass}
          >
            <option value="">— none —</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName ?? ""}
              </option>
            ))}
          </select>
        </label>
        {["DATE", "ANNIVERSARY"].includes(triggerType) ? (
        <label className={labelClass}>
          Datum (för datum- och årsdagsutlösare)
          <input
            name="triggerDate"
            type="date"
            defaultValue={tc.date ?? ""}
            className={inputClass}
          />
        </label>
        ) : null}
        {["DATE", "ANNIVERSARY", "BIRTHDAY", "NAME_DAY", "INTERVAL"].includes(triggerType) ? (
        <label className={labelClass}>
          Klockslag (lokal tid)
          <input
            name="triggerTime"
            type="time"
            defaultValue={tc.time ?? "09:00"}
            className={inputClass}
          />
        </label>
        ) : null}
        {["INTERVAL", "NO_CONTACT_FOR"].includes(triggerType) ? (
        <label className={labelClass}>
          Dagar (för intervall och tystnadsutlösare)
          <input
            name="triggerDays"
            type="number"
            min="1"
            defaultValue={tc.days ?? ""}
            className={inputClass}
          />
        </label>
        ) : null}
        {triggerType === "CRON" ? (
        <label className={labelClass}>
          Cron-uttryck (avancerat)
          <input
            name="triggerCron"
            placeholder="0 9 * * 1"
            defaultValue={tc.cron ?? ""}
            className={inputClass}
          />
        </label>
        ) : null}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Gör (åtgärd)
          <select
            name="actionType"
            value={actionType}
            onChange={(event) =>
              setActionType(event.target.value as Automation["actionType"])
            }
            className={inputClass}
          >
            {ACTIONS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          Behörighet (självständighet)
          <select
            name="autonomyLevel"
            defaultValue={String(automation?.autonomyLevel ?? 1)}
            className={inputClass}
          >
            {Object.entries(AUTONOMY_LABELS).map(([level, label]) => (
              <option key={level} value={level}>
                {level} — {label}
              </option>
            ))}
          </select>
        </label>
        {actionType === "GENERATE_SMS" ? (
        <>
        <label className={labelClass}>
          Meddelandets syfte (för AI-generering)
          <select
            name="actionPurpose"
            defaultValue={
              ac.purpose ??
              (defaultTriggerType === "NAME_DAY"
                ? "name_day"
                : defaultTriggerType === "BIRTHDAY"
                  ? "birthday"
                  : "checkin")
            }
            className={inputClass}
          >
            <option value="birthday">Födelsedagshälsning</option>
            <option value="name_day">Namnsdagshälsning</option>
            <option value="checkin">Vänlig avstämning</option>
            <option value="holiday">Högtidshälsning</option>
          </select>
        </label>
        <label className={labelClass}>
          Extra instruktion till AI:n
          <input
            name="actionInstruction"
            placeholder="Nämn fisketuren om det passar"
            defaultValue={ac.instruction ?? ""}
            className={inputClass}
          />
        </label>
        </>
        ) : null}
        {actionType === "SEND_SMS" ? (
        <label className={`${labelClass} sm:col-span-2`}>
          Fixed SMS text (for &quot;send fixed SMS&quot;)
          <textarea
            name="actionText"
            rows={2}
            defaultValue={ac.text ?? ""}
            className={inputClass}
          />
        </label>
        ) : null}
        {["REMIND_USER", "CREATE_TASK", "CREATE_CALENDAR_EVENT", "ESCALATE", "LOG_EVENT"].includes(actionType) ? (
        <label className={labelClass}>
          Rubrik (för påminnelser, uppgifter och händelser)
          <input
            name="actionTitle"
            defaultValue={ac.title ?? ""}
            className={inputClass}
          />
        </label>
        ) : null}
        {["REMIND_USER", "CREATE_TASK", "CREATE_CALENDAR_EVENT", "ESCALATE", "LOG_EVENT"].includes(actionType) ? (
        <label className={labelClass}>
          Detaljer
          <input
            name="actionDescription"
            defaultValue={ac.description ?? ""}
            className={inputClass}
          />
        </label>
        ) : null}
        {actionType === "UPDATE_CONTACT" ? (
        <label className={labelClass}>
          Kontaktfält (för uppdateringsåtgärd)
          <select
            name="actionField"
            defaultValue={
              ac.fields
                ? (Object.keys(ac.fields)[0] ?? "notes")
                : "notes"
            }
            className={inputClass}
          >
            <option value="notes">Anteckningar</option>
            <option value="importance">Betydelse</option>
            <option value="relationshipType">Relationstyp</option>
          </select>
        </label>
        ) : null}
        {actionType === "UPDATE_CONTACT" ? (
        <label className={labelClass}>
          Nytt värde
          <input
            name="actionValue"
            defaultValue={
              ac.fields
                ? String(Object.values(ac.fields)[0] ?? "")
                : ""
            }
            className={inputClass}
          />
        </label>
        ) : null}
      </div>

      <p className="text-xs text-stone-400">
        Autonomy: sending happens automatically only at level 4. Levels 2–3
        create drafts you approve from Today. The contact&apos;s own autonomy
        setting caps this — the stricter value wins.
      </p>
    </div>
  );
}
