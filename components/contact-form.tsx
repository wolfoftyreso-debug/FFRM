import type { Contact } from "@/lib/db/schema";
import { inputClass, labelClass } from "@/components/ui";
import { AUTONOMY_LABELS } from "@/lib/ai/policy";
import { relationshipTypeLabel } from "@/lib/terminology";

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
  ["informal, warm, short messages", "Informell, varm och kort"],
  ["warm and supportive", "Varm och stöttande"],
  ["concise and direct", "Kortfattad och rak"],
  ["formal and professional", "Formell och professionell"],
  ["playful and humorous", "Lekfull och humoristisk"],
  ["neutral", "Neutral"],
] as const;

const MONTHS = [
  "januari",
  "februari",
  "mars",
  "april",
  "maj",
  "juni",
  "juli",
  "augusti",
  "september",
  "oktober",
  "november",
  "december",
];

export function ContactFormFields({ contact }: { contact?: Contact | null }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <h3 className="text-sm font-semibold text-stone-800">Identitet</h3>
        <p className="mt-0.5 text-xs text-stone-400">
          Börja med det nödvändiga. Resten kan fyllas i senare.
        </p>
      </div>
      <label className={labelClass}>
        Förnamn *
        <input
          name="firstName"
          required
          defaultValue={contact?.firstName ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Efternamn
        <input
          name="lastName"
          defaultValue={contact?.lastName ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Smeknamn
        <input
          name="nickname"
          defaultValue={contact?.nickname ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Visningsnamn
        <input
          name="displayName"
          placeholder="Så visas namnet i Telefon och Meddelanden"
          defaultValue={contact?.displayName ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Telefonnummer
        <input
          name="phoneNumber"
          placeholder="+46701234567 eller 0701234567"
          defaultValue={contact?.phoneNumber ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        E-post
        <input
          name="email"
          type="email"
          defaultValue={contact?.email ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Födelsedag
        <input
          name="birthday"
          type="date"
          defaultValue={contact?.birthday ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Namnsdag
        <span className="mt-1 grid grid-cols-[1fr_100px] gap-2">
          <select
            name="nameDayMonth"
            defaultValue={contact?.nameDayMonth ?? ""}
            className={inputClass}
          >
            <option value="">Månad</option>
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
            <option value="">Dag</option>
            {Array.from({ length: 31 }, (_, index) => (
              <option key={index + 1} value={index + 1}>
                {index + 1}
              </option>
            ))}
          </select>
        </span>
        <span className="mt-1 block text-xs text-stone-400">
          Namnsdagar återkommer varje år.
        </span>
      </label>
      <div className="sm:col-span-2 mt-2 border-t border-black/10 pt-4">
        <h3 className="text-sm font-semibold text-stone-800">Relation</h3>
      </div>
      <label className={labelClass}>
        Relation
        <select
          name="relationshipType"
          defaultValue={contact?.relationshipType ?? "FRIEND"}
          className={inputClass}
        >
          {RELATIONSHIP_TYPES.map((t) => (
            <option key={t} value={t}>
              {relationshipTypeLabel(t)}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Betydelse
        <select
          name="importance"
          defaultValue={contact?.importance ?? "MEDIUM"}
          className={inputClass}
        >
          <option value="LOW">Låg</option>
          <option value="MEDIUM">Mellan</option>
          <option value="HIGH">Hög</option>
        </select>
      </label>
      <label className={labelClass}>
        Språk
        <select
          name="preferredLanguage"
          defaultValue={contact?.preferredLanguage ?? ""}
          className={inputClass}
        >
          <option value="">Använd min standard</option>
          {LANGUAGE_OPTIONS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label className={labelClass}>
        Tidszon
        <select
          name="timezone"
          defaultValue={contact?.timezone ?? ""}
          className={inputClass}
        >
          <option value="">Använd min standard</option>
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
          AI och kommunikation
        </h3>
        <p className="mt-0.5 text-xs text-stone-400">
          De här inställningarna styr tonen och hur mycket assistenten får göra.
        </p>
      </div>
      <label className={labelClass}>
        Önskad kontaktfrekvens (dagar)
        <input
          name="desiredContactCadenceDays"
          type="number"
          min="1"
          defaultValue={contact?.desiredContactCadenceDays ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Kommunikationsstil
        <select
          name="communicationStyle"
          defaultValue={contact?.communicationStyle ?? ""}
          className={inputClass}
        >
          <option value="">Lär från era samtal</option>
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
        Emojistil
        <select
          name="emojiStyle"
          defaultValue={contact?.emojiStyle ?? ""}
          className={inputClass}
        >
          <option value="">Lär från era samtal</option>
          <option value="none">Inga</option>
          <option value="light">Sparsamt</option>
          <option value="moderate">Lagom</option>
          <option value="heavy">Mycket</option>
        </select>
      </label>
      <label className={labelClass}>
        AI:ns självständighet
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
        Humor tillåten
      </label>
      <label className="flex items-center gap-2 text-sm font-medium text-stone-700 sm:col-span-2">
        <input
          type="checkbox"
          name="automaticBirthdayGreeting"
          defaultChecked={contact?.automaticBirthdayGreeting ?? false}
          className="h-4 w-4 rounded border-stone-300"
        />
        Automatisk födelsedagshälsning
      </label>
      <label className={`${labelClass} sm:col-span-2`}>
        Anteckningar
        <textarea
          name="notes"
          rows={3}
          defaultValue={contact?.notes ?? ""}
          className={inputClass}
        />
      </label>
      <div className="sm:col-span-2 mt-2 border-t border-black/10 pt-4">
        <h3 className="text-sm font-semibold text-stone-800">Arbete och intressen</h3>
      </div>
      <label className={labelClass}>
        Företag
        <input
          name="company"
          defaultValue={contact?.profile?.company ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Titel
        <input
          name="jobTitle"
          defaultValue={contact?.profile?.jobTitle ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Intressen (kommaseparerade)
        <input
          name="interests"
          defaultValue={contact?.profile?.interests?.join(", ") ?? ""}
          className={inputClass}
        />
      </label>
      <label className={labelClass}>
        Fritidsintressen (kommaseparerade)
        <input
          name="hobbies"
          defaultValue={contact?.profile?.hobbies?.join(", ") ?? ""}
          className={inputClass}
        />
      </label>
    </div>
  );
}
