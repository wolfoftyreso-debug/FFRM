/**
 * Phone number normalization to E.164.
 *
 * All stored and matched numbers use the canonical E.164 representation
 * (e.g. +46701234567). Never compare raw strings.
 */

const DEFAULT_COUNTRY_PREFIX = "+46"; // Sweden

export function normalizePhoneNumber(
  input: string,
  defaultCountryPrefix: string = DEFAULT_COUNTRY_PREFIX,
): string | null {
  if (!input) return null;
  let cleaned = input.trim().replace(/[\s\-().]/g, "");
  if (cleaned.startsWith("00")) cleaned = `+${cleaned.slice(2)}`;
  if (cleaned.startsWith("+")) {
    const digits = cleaned.slice(1);
    if (!/^\d{7,15}$/.test(digits)) return null;
    return `+${digits}`;
  }
  if (!/^\d+$/.test(cleaned)) return null;
  // National format: drop leading 0 and prepend country code.
  const national = cleaned.startsWith("0") ? cleaned.slice(1) : cleaned;
  const candidate = `${defaultCountryPrefix}${national}`;
  const digits = candidate.slice(1);
  if (!/^\d{7,15}$/.test(digits)) return null;
  return candidate;
}

export function isE164(value: string): boolean {
  return /^\+\d{7,15}$/.test(value);
}
