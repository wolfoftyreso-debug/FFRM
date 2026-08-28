import { normalizePhoneNumber } from "@/lib/phone";

export const MAX_BROADCAST_RECIPIENTS = 10_000;

export interface ParsedPhoneEntry {
  phoneNumber: string;
  firstName: string | null;
}

/**
 * Extracts phone numbers from pasted or uploaded lists.
 * Accepts one number per line, CSV/TSV, or mixed separators.
 */
export function parsePhoneList(raw: string): ParsedPhoneEntry[] {
  const seen = new Set<string>();
  const entries: ParsedPhoneEntry[] = [];
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  for (const line of lines) {
    if (entries.length >= MAX_BROADCAST_RECIPIENTS) break;
    const fields = line
      .split(/[,;\t|]/)
      .map((field) => field.trim().replace(/^["']|["']$/g, ""))
      .filter(Boolean);
    if (fields.length === 0) continue;

    let phoneNumber: string | null = null;
    const leftovers: string[] = [];
    for (const field of fields) {
      const normalized = normalizePhoneNumber(field);
      if (normalized && !phoneNumber) {
        phoneNumber = normalized;
      } else {
        leftovers.push(field);
      }
    }
    if (!phoneNumber) {
      const match = line.match(/(?:\+|00)?[\d][\d\s\-().]{6,20}\d/);
      phoneNumber = match ? normalizePhoneNumber(match[0]) : null;
    }
    if (!phoneNumber || seen.has(phoneNumber)) continue;
    seen.add(phoneNumber);
    const nameSource = leftovers.find((value) => /[A-Za-zÅÄÖåäö]/.test(value));
    entries.push({
      phoneNumber,
      firstName: nameSource ? firstNameFrom(nameSource) : null,
    });
  }
  return entries;
}

export function personalizeBroadcast(
  template: string,
  firstName: string | null,
  enabled: boolean,
): string {
  if (!enabled) return template.trim();
  const name = (firstName ?? "").trim();
  return template
    .replace(/\*namn\*/gi, name)
    .replace(/\*name\*/gi, name)
    .trim();
}

function firstNameFrom(value: string): string {
  return value.split(/\s+/)[0]?.slice(0, 40) ?? "";
}
