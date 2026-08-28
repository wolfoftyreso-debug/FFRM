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

const LANGUAGE_OPTIONS = [
  ["sv", "Svenska"],
  ["en", "English"],
  ["nb", "Norsk"],
  ["da", "Dansk"],
  ["fi", "Suomi"],
  ["de", "Deutsch"],
  ["fr", "Français"],
  ["es", "Español"],
] as const;

const TIMEZONE_OPTIONS = [
  "Europe/Stockholm",
  "Europe/Oslo",
  "Europe/Copenhagen",
  "Europe/Helsinki",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Tokyo",
  "Australia/Sydney",
  "UTC",
];

const COMMUNICATION_STYLES = [
  ["informal, warm, short messages", "Informal, warm and short"],
  ["warm and supportive", "Warm and supportive"],
  ["concise and direct", "Concise and direct"],
  ["formal and professional", "Formal and professional"],
  ["playful and humorous", "Playful and humorous"],
  ["neutral", "Neutral"],
] as const;

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function ContactFormFields({ contact }: { contact?: Contact | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold text-stone-800">Identity</h3>
        <p className="mt-0.5 text-xs text-stone-400">
          Start with the essentials. Everything else can be added later.
        </p>
      </div>
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
        Display name
        <input
          name="displayName"
          placeholder="How the name appears in Phone and Messages"
          defaultValue={contact?.displayName ?? ""}
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
        Name day
        <span className="mt-1 grid grid-cols-[1fr_100px] gap-2">
          <select
            name="nameDayMonth"
            defaultValue={contact?.nameDayMonth ?? ""}
            className={inputClass}
          >
            <option value="">Month</option>
            {MONTHS.map((month, index) => (
              <option key={month} value={index + 1}>
                {month}
              </option>
            ))}
          </select>
          <select
            name="nameDayDay"
            defaultValue={contact?.nameDayDay ?? ""}
            className={inputClass}
          >
            <option value="">Day</option>
            {Array.from({ length: 31 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </span>
        <span className="mt-1 block text-xs text-stone-400">
          Name days repeat every year.
        </span>
      </label>
      <div className="sm:col-span-2 mt-2 border-t border-black/10 pt-4">
        <h3 className="text-sm font-semibold text-stone-800">Relationship</h3>
      </div>
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
        <select
          name="preferredLanguage"
          defaultValue={contact?.preferredLanguage ?? ""}
          className={inputClass}
        >
          <option value="">Use owner default</option>
          {LANGUAGE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Timezone
        <select
          name="timezone"
          defaultValue={contact?.timezone ?? ""}
          className={inputClass}
        >
          <option value="">Use owner default</option>
          {contact?.timezone &&
          !TIMEZONE_OPTIONS.includes(contact.timezone) ? (
            <option value={contact.timezone}>{contact.timezone}</option>
          ) : null}
          {TIMEZONE_OPTIONS.map((timezone) => (
            <option key={timezone} value={timezone}>
              {timezone.replaceAll("_", " ")}
            </option>
          ))}
        </select>
      </label>
      <div className="sm:col-span-2 mt-2 border-t border-black/10 pt-4">
        <h3 className="text-sm font-semibold text-stone-800">
          AI & communication
        </h3>
        <p className="mt-0.5 text-xs text-stone-400">
          These settings control tone and how much the assistant may do.
        </p>
      </div>
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
        <select
          name="communicationStyle"
          defaultValue={contact?.communicationStyle ?? ""}
          className={inputClass}
        >
          <option value="">Learn from conversations</option>
          {contact?.communicationStyle &&
          !COMMUNICATION_STYLES.some(
            ([value]) => value === contact.communicationStyle,
          ) ? (
            <option value={contact.communicationStyle}>
              {contact.communicationStyle}
            </option>
          ) : null}
          {COMMUNICATION_STYLES.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Emoji style
        <select
          name="emojiStyle"
          defaultValue={contact?.emojiStyle ?? ""}
          className={inputClass}
        >
          <option value="">Learn from conversations</option>
          <option value="none">None</option>
          <option value="light">Light</option>
          <option value="moderate">Moderate</option>
          <option value="heavy">Heavy</option>
        </select>
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
      <div className="sm:col-span-2 mt-2 border-t border-black/10 pt-4">
        <h3 className="text-sm font-semibold text-stone-800">Work & interests</h3>
      </div>
      <label className={labelClass}>
        Company
        <input
          name="company"
          defaultValue={contact?.profile?.company ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Job title
        <input
          name="jobTitle"
          defaultValue={contact?.profile?.jobTitle ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Interests (comma-separated)
        <input
          name="interests"
          defaultValue={contact?.profile?.interests?.join(", ") ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Hobbies (comma-separated)
        <input
          name="hobbies"
          defaultValue={contact?.profile?.hobbies?.join(", ") ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}
