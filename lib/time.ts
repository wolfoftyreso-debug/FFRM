/**
 * Minimal timezone utilities (no external tz dependency).
 * Converts a wall-clock time in an IANA timezone to a UTC Date.
 */

function tzOffsetMs(ts: number, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(new Date(ts));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asUtc - ts;
}

/** UTC Date for the given wall-clock time in the given timezone. */
export function zonedTimeToUtc(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
  let ts = wanted;
  // Two iterations converge for all real-world offsets, including DST edges.
  for (let i = 0; i < 3; i++) {
    const offset = tzOffsetMs(ts, timeZone);
    const next = wanted - offset;
    if (next === ts) break;
    ts = next;
  }
  return new Date(ts);
}

/** Local wall-clock parts of a UTC instant in a timezone. */
export function utcToZonedParts(
  date: Date,
  timeZone: string,
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sunday
} {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = (type: string) =>
    parts.find((p) => p.type === type)?.value ?? "0";
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: Number(get("hour")) % 24,
    minute: Number(get("minute")),
    weekday: weekdays.indexOf(get("weekday")),
  };
}

export function parseTimeOfDay(time: string | undefined): {
  hour: number;
  minute: number;
} {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time ?? "");
  if (!match) return { hour: 9, minute: 0 };
  const hour = Math.min(23, Number(match[1]));
  const minute = Math.min(59, Number(match[2]));
  return { hour, minute };
}
