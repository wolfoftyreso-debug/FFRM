import type { Automation, Contact } from "@/lib/db/schema";
import { inputClass, labelClass } from "@/components/ui";
import { AUTONOMY_LABELS } from "@/lib/ai/policy";

const TRIGGERS = [
  { id: "BIRTHDAY", label: "On the contact's birthday" },
  { id: "ANNIVERSARY", label: "On an anniversary (yearly date)" },
  { id: "DATE", label: "On a specific date (once)" },
  { id: "INTERVAL", label: "Every N days" },
  { id: "NO_CONTACT_FOR", label: "When no contact for N days" },
  { id: "MANUAL", label: "Manually (run from this page)" },
  { id: "CRON", label: "Advanced: cron expression" },
];

const ACTIONS = [
  { id: "GENERATE_SMS", label: "Generate a personal SMS with AI" },
  { id: "SEND_SMS", label: "Send a fixed SMS text" },
  { id: "REMIND_USER", label: "Remind me" },
  { id: "AI_EVALUATE", label: "AI: evaluate whether I should reach out" },
  { id: "CREATE_TASK", label: "Create a task" },
  { id: "CREATE_CALENDAR_EVENT", label: "Create a calendar event" },
  { id: "ESCALATE", label: "Escalate to me" },
  { id: "LOG_EVENT", label: "Log an event" },
];

export function AutomationFormFields({
  automation,
  contacts,
  defaultContactId,
}: {
  automation?: Automation | null;
  contacts: Contact[];
  defaultContactId?: string;
}) {
  const tc = automation?.triggerConfig ?? {};
  const ac = automation?.actionConfig ?? {};
  return (
    <div className="space-y-4">
      <label className={labelClass}>
        Name *
        <input
          name="name"
          required
          placeholder="Johan's birthday greeting"
          defaultValue={automation?.name ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Description
        <input
          name="description"
          defaultValue={automation?.description ?? ""}
          className={inputClass}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          When (trigger)
          <select
            name="triggerType"
            defaultValue={automation?.triggerType ?? "BIRTHDAY"}
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
          Contact
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
        <label className={labelClass}>
          Date (for date/anniversary triggers)
          <input
            name="triggerDate"
            type="date"
            defaultValue={tc.date ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          At (local time)
          <input
            name="triggerTime"
            type="time"
            defaultValue={tc.time ?? "09:00"}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Days (for interval / no-contact triggers)
          <input
            name="triggerDays"
            type="number"
            min="1"
            defaultValue={tc.days ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Cron expression (advanced)
          <input
            name="triggerCron"
            placeholder="0 9 * * 1"
            defaultValue={tc.cron ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className={labelClass}>
          Do (action)
          <select
            name="actionType"
            defaultValue={automation?.actionType ?? "GENERATE_SMS"}
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
          Permission (autonomy)
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
        <label className={labelClass}>
          Message purpose (for AI generation)
          <select name="actionPurpose" defaultValue={ac.purpose ?? "checkin"} className={inputClass}>
            <option value="birthday">Birthday greeting</option>
            <option value="checkin">Friendly check-in</option>
            <option value="holiday">Holiday greeting</option>
          </select>
        </label>
        <label className={labelClass}>
          Extra instruction for the AI
          <input
            name="actionInstruction"
            placeholder="Mention the fishing trip if relevant"
            defaultValue={ac.instruction ?? ""}
            className={inputClass}
          />
        </label>
        <label className={`${labelClass} sm:col-span-2`}>
          Fixed SMS text (for &quot;send fixed SMS&quot;)
          <textarea
            name="actionText"
            rows={2}
            defaultValue={ac.text ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Title (for reminders/tasks/events)
          <input
            name="actionTitle"
            defaultValue={ac.title ?? ""}
            className={inputClass}
          />
        </label>
        <label className={labelClass}>
          Details
          <input
            name="actionDescription"
            defaultValue={ac.description ?? ""}
            className={inputClass}
          />
        </label>
      </div>

      <p className="text-xs text-stone-400">
        Autonomy: sending happens automatically only at level 4. Levels 2–3
        create drafts you approve from Today. The contact&apos;s own autonomy
        setting caps this — the stricter value wins.
      </p>
    </div>
  );
}
