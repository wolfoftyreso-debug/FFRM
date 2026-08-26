import type { Automation, Contact, TriggerConfig } from "@/lib/db/schema";
import { parseTimeOfDay, utcToZonedParts, zonedTimeToUtc } from "@/lib/time";
import { defaultTimezone } from "@/lib/env";

/**
 * Next-run calculation for automation triggers. Pure functions — the
 * dispatcher persists results. New trigger types plug in here without
 * touching the scheduler loop.
 */

const NO_CONTACT_RECHECK_MS = 60 * 60 * 1000; // evaluate hourly

export function computeNextRun(args: {
  triggerType: Automation["triggerType"];
  triggerConfig: TriggerConfig;
  contact?: Partial<
    Pick<
    Contact,
    "birthday" | "nameDayMonth" | "nameDayDay" | "timezone"
    >
  > | null;
  after: Date;
  timezone?: string;
}): Date | null {
  const tz = args.timezone ?? args.contact?.timezone ?? defaultTimezone();
  const { hour, minute } = parseTimeOfDay(args.triggerConfig.time);

  switch (args.triggerType) {
    case "BIRTHDAY": {
      const birthday = args.contact?.birthday;
      if (!birthday) return null;
      const [, m, d] = birthday.split("-").map(Number);
      return nextYearlyOccurrence(m, d, hour, minute, tz, args.after);
    }
    case "NAME_DAY": {
      const month = args.contact?.nameDayMonth;
      const day = args.contact?.nameDayDay;
      if (!month || !day) return null;
      return nextYearlyOccurrence(month, day, hour, minute, tz, args.after);
    }
    case "ANNIVERSARY": {
      const dateStr = args.triggerConfig.date;
      if (!dateStr) return null;
      const [y, m, d] = dateStr.split("-").map(Number);
      if (args.triggerConfig.yearly === false) {
        const at = zonedTimeToUtc(y, m, d, hour, minute, tz);
        return at > args.after ? at : null;
      }
      return nextYearlyOccurrence(m, d, hour, minute, tz, args.after);
    }
    case "DATE": {
      const dateStr = args.triggerConfig.date;
      if (!dateStr) return null;
      const [y, m, d] = dateStr.split("-").map(Number);
      const at = zonedTimeToUtc(y, m, d, hour, minute, tz);
      return at > args.after ? at : null;
    }
    case "INTERVAL": {
      const days = args.triggerConfig.days;
      if (!days || days < 1) return null;
      const base = new Date(args.after.getTime() + days * 24 * 60 * 60 * 1000);
      if (args.triggerConfig.time) {
        const parts = utcToZonedParts(base, tz);
        return zonedTimeToUtc(parts.year, parts.month, parts.day, hour, minute, tz);
      }
      return base;
    }
    case "CRON": {
      const expr = args.triggerConfig.cron;
      if (!expr) return null;
      return nextCronOccurrence(expr, tz, args.after);
    }
    case "NO_CONTACT_FOR":
      // Evaluated periodically; the condition check happens in the dispatcher.
      return new Date(args.after.getTime() + NO_CONTACT_RECHECK_MS);
    case "INCOMING_SMS":
    case "MANUAL":
    case "FOLLOW_UP_DUE":
    case "CUSTOM_EVENT":
      // Event-driven / manual triggers are not scheduled.
      return null;
  }
}

/** Next yearly occurrence of month/day at hour:minute in tz, strictly after `after`. Feb 29 falls back to Feb 28. */
export function nextYearlyOccurrence(
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
  after: Date,
): Date {
  const startYear = utcToZonedParts(after, tz).year;
  for (let year = startYear; year <= startYear + 2; year++) {
    let d = day;
    if (month === 2 && day === 29 && !isLeapYear(year)) d = 28;
    const candidate = zonedTimeToUtc(year, month, d, hour, minute, tz);
    if (candidate > after) return candidate;
  }
  throw new Error("nextYearlyOccurrence failed to converge");
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Minimal 5-field cron ("m h dom mon dow") next-occurrence scan, evaluated in
 * the given timezone. Supports "*", lists, ranges and steps.
 */
export function nextCronOccurrence(
  expr: string,
  tz: string,
  after: Date,
): Date | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minF, hourF, domF, monF, dowF] = fields;
  const minutes = parseCronField(minF, 0, 59);
  const hours = parseCronField(hourF, 0, 23);
  const doms = parseCronField(domF, 1, 31);
  const months = parseCronField(monF, 1, 12);
  const dows = parseCronField(dowF, 0, 6, true);
  if (!minutes || !hours || !doms || !months || !dows) return null;

  const domRestricted = domF !== "*";
  const dowRestricted = dowF !== "*";

  const dayMatches = (p: { day: number; weekday: number }) => {
    // Standard cron semantics: dom/dow are OR-ed when both are restricted.
    const domMatch = doms.has(p.day);
    const dowMatch = dows.has(p.weekday);
    return domRestricted && dowRestricted
      ? domMatch || dowMatch
      : domMatch && dowMatch;
  };

  // Scan forward with coarse jumps, capped at 366 days.
  let ts = Math.floor(after.getTime() / 60000) * 60000 + 60000;
  const cap = ts + 366 * 24 * 60 * 60 * 1000;
  while (ts < cap) {
    const p = utcToZonedParts(new Date(ts), tz);
    const toNextLocalMidnight = ((24 - p.hour) * 60 - p.minute) * 60000;
    if (!months.has(p.month)) {
      ts += toNextLocalMidnight;
      continue;
    }
    if (!dayMatches(p)) {
      ts += toNextLocalMidnight;
      continue;
    }
    if (!hours.has(p.hour)) {
      ts += (60 - p.minute) * 60000; // jump to next local hour boundary
      continue;
    }
    if (!minutes.has(p.minute)) {
      ts += 60000;
      continue;
    }
    return new Date(ts);
  }
  return null;
}

function parseCronField(
  field: string,
  min: number,
  max: number,
  isDow = false,
): Set<number> | null {
  const values = new Set<number>();
  for (const part of field.split(",")) {
    const stepMatch = /^(.+)\/(\d+)$/.exec(part);
    const stepped = stepMatch ? Number(stepMatch[2]) : 1;
    const core = stepMatch ? stepMatch[1] : part;
    let lo = min;
    let hi = max;
    if (core !== "*") {
      const range = /^(\d+)-(\d+)$/.exec(core);
      if (range) {
        lo = Number(range[1]);
        hi = Number(range[2]);
      } else if (/^\d+$/.test(core)) {
        lo = hi = Number(core);
      } else {
        return null;
      }
    }
    if (stepped < 1) return null;
    for (let v = lo; v <= hi; v += stepped) {
      let value = v;
      if (isDow && value === 7) value = 0;
      if (value < min || value > max) return null;
      values.add(value);
    }
  }
  return values.size > 0 ? values : null;
}

/** Occurrence key: makes each scheduled occurrence executable exactly once. */
export function occurrenceKeyFor(args: {
  triggerType: Automation["triggerType"];
  scheduledFor: Date;
  lastInteractionAt?: Date | null;
}): string {
  switch (args.triggerType) {
    case "BIRTHDAY":
      return `birthday-${args.scheduledFor.toISOString().slice(0, 10)}`;
    case "NAME_DAY":
      return `name-day-${args.scheduledFor.toISOString().slice(0, 10)}`;
    case "ANNIVERSARY":
      return `anniversary-${args.scheduledFor.toISOString().slice(0, 10)}`;
    case "DATE":
      return `date-${args.scheduledFor.toISOString()}`;
    case "NO_CONTACT_FOR":
      // One reminder per inactivity episode: new interaction ⇒ new key.
      return `nocontact-${args.lastInteractionAt?.toISOString() ?? "never"}`;
    default:
      return `t-${args.scheduledFor.toISOString()}`;
  }
}
