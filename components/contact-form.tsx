import type { Contact } from "@/lib/db/schema";
import { inputClass, labelClass } from "@/components/ui";
import { AUTONOMY_LABELS } from "@/lib/ai/policy";

const RELATIONSHIP_TYPES = [
  "FAMILY",
  "FRIEND",
  "PARTNER",
  "WORK",
  "ACQUAINTANCE",
  "OTHER",
];

export function ContactFormFields({ contact }: { contact?: Contact | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className={labelClass}>
        First name *
        <input
          name="firstName"
          required
          defaultValue={contact?.firstName ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Last name
        <input
          name="lastName"
          defaultValue={contact?.lastName ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Nickname
        <input
          name="nickname"
          defaultValue={contact?.nickname ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Phone number
        <input
          name="phoneNumber"
          placeholder="+46701234567 or 0701234567"
          defaultValue={contact?.phoneNumber ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Email
        <input
          name="email"
          type="email"
          defaultValue={contact?.email ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Birthday
        <input
          name="birthday"
          type="date"
          defaultValue={contact?.birthday ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Relationship
        <select
          name="relationshipType"
          defaultValue={contact?.relationshipType ?? "FRIEND"}
          className={inputClass}
        >
          {RELATIONSHIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {t.charAt(0) + t.slice(1).toLowerCase()}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Importance
        <select
          name="importance"
          defaultValue={contact?.importance ?? "MEDIUM"}
          className={inputClass}
        >
          <option value="LOW">Low</option>
          <option value="MEDIUM">Medium</option>
          <option value="HIGH">High</option>
        </select>
      </label>
      <label className={labelClass}>
        Preferred language
        <input
          name="preferredLanguage"
          placeholder="sv"
          defaultValue={contact?.preferredLanguage ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Timezone
        <input
          name="timezone"
          placeholder="Europe/Stockholm"
          defaultValue={contact?.timezone ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Desired contact cadence (days)
        <input
          name="desiredContactCadenceDays"
          type="number"
          min="1"
          defaultValue={contact?.desiredContactCadenceDays ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Communication style
        <input
          name="communicationStyle"
          placeholder="informal, warm, short messages"
          defaultValue={contact?.communicationStyle ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Emoji style
        <input
          name="emojiStyle"
          placeholder="light / none / heavy"
          defaultValue={contact?.emojiStyle ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        AI autonomy
        <select
          name="autonomyLevel"
          defaultValue={String(contact?.autonomyLevel ?? 1)}
          className={inputClass}
        >
          {Object.entries(AUTONOMY_LABELS).map(([level, label]) => (
            <option key={level} value={level}>
              {level} — {label}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
        <input
          type="checkbox"
          name="humorAllowed"
          defaultChecked={contact?.humorAllowed ?? true}
          className="h-4 w-4 rounded border-stone-300"
        />
        Humor allowed
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
        <input
          type="checkbox"
          name="automaticBirthdayGreeting"
          defaultChecked={contact?.automaticBirthdayGreeting ?? false}
          className="h-4 w-4 rounded border-stone-300"
        />
        Automatic birthday greeting
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Notes
        <textarea
          name="notes"
          rows={3}
          defaultValue={contact?.notes ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}
