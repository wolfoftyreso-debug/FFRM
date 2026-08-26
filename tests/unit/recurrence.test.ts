import { describe, expect, it } from "vitest";
import {
  computeNextRun,
  nextCronOccurrence,
  nextYearlyOccurrence,
  occurrenceKeyFor,
} from "@/lib/automations/recurrence";

const TZ = "Europe/Stockholm";

describe("nextYearlyOccurrence", () => {
  it("returns this year when the date is still ahead", () => {
    const after = new Date("2026-01-10T00:00:00Z");
    const next = nextYearlyOccurrence(3, 15, 9, 0, TZ, after);
    expect(next.toISOString()).toBe("2026-03-15T08:00:00.000Z"); // 09:00 CET
  });

  it("rolls to next year when the date has passed", () => {
    const after = new Date("2026-03-15T09:00:00Z"); // already past 09:00 CET
    const next = nextYearlyOccurrence(3, 15, 9, 0, TZ, after);
    expect(next.getUTCFullYear()).toBe(2027);
  });

  it("handles Feb 29 birthdays in non-leap years", () => {
    const after = new Date("2026-01-01T00:00:00Z"); // 2026 is not a leap year
    const next = nextYearlyOccurrence(2, 29, 9, 0, TZ, after);
    expect(next.toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("uses DST-correct offsets in summer", () => {
    const after = new Date("2026-01-01T00:00:00Z");
    const next = nextYearlyOccurrence(7, 1, 9, 0, TZ, after);
    expect(next.toISOString()).toBe("2026-07-01T07:00:00.000Z"); // 09:00 CEST
  });
});

describe("computeNextRun", () => {
  it("BIRTHDAY uses the contact birthday", () => {
    const next = computeNextRun({
      triggerType: "BIRTHDAY",
      triggerConfig: { time: "09:00" },
      contact: { birthday: "1988-03-15", timezone: TZ },
      after: new Date("2026-01-01T00:00:00Z"),
    });
    expect(next?.toISOString()).toBe("2026-03-15T08:00:00.000Z");
  });

  it("BIRTHDAY without a birthday returns null", () => {
    const next = computeNextRun({
      triggerType: "BIRTHDAY",
      triggerConfig: {},
      contact: { birthday: null, timezone: null },
      after: new Date(),
    });
    expect(next).toBeNull();
  });

  it("NAME_DAY recurs yearly from contact month/day", () => {
    const next = computeNextRun({
      triggerType: "NAME_DAY",
      triggerConfig: { time: "09:00" },
      contact: {
        birthday: null,
        nameDayMonth: 6,
        nameDayDay: 24,
        timezone: TZ,
      },
      after: new Date("2026-01-01T00:00:00Z"),
    });
    expect(next?.toISOString()).toBe("2026-06-24T07:00:00.000Z");
  });

  it("DATE in the past returns null (one-shot)", () => {
    const next = computeNextRun({
      triggerType: "DATE",
      triggerConfig: { date: "2020-01-01", time: "09:00" },
      after: new Date("2026-01-01T00:00:00Z"),
    });
    expect(next).toBeNull();
  });

  it("INTERVAL adds N days", () => {
    const after = new Date("2026-01-01T00:00:00Z");
    const next = computeNextRun({
      triggerType: "INTERVAL",
      triggerConfig: { days: 30 },
      after,
    });
    expect(next?.getTime()).toBe(after.getTime() + 30 * 24 * 3600 * 1000);
  });

  it("NO_CONTACT_FOR re-evaluates hourly", () => {
    const after = new Date("2026-01-01T00:00:00Z");
    const next = computeNextRun({
      triggerType: "NO_CONTACT_FOR",
      triggerConfig: { days: 10 },
      after,
    });
    expect(next?.getTime()).toBe(after.getTime() + 3600 * 1000);
  });

  it("MANUAL is never scheduled", () => {
    expect(
      computeNextRun({ triggerType: "MANUAL", triggerConfig: {}, after: new Date() }),
    ).toBeNull();
  });
});

describe("nextCronOccurrence", () => {
  it("daily at 09:00", () => {
    const next = nextCronOccurrence(
      "0 9 * * *",
      TZ,
      new Date("2026-06-10T12:00:00Z"),
    );
    expect(next?.toISOString()).toBe("2026-06-11T07:00:00.000Z"); // 09:00 CEST
  });

  it("weekly on Mondays", () => {
    const next = nextCronOccurrence(
      "30 8 * * 1",
      TZ,
      new Date("2026-06-10T12:00:00Z"), // a Wednesday
    );
    expect(next?.toISOString()).toBe("2026-06-15T06:30:00.000Z"); // Monday
  });

  it("yearly on Dec 20", () => {
    const next = nextCronOccurrence(
      "0 9 20 12 *",
      TZ,
      new Date("2026-06-10T12:00:00Z"),
    );
    expect(next?.toISOString()).toBe("2026-12-20T08:00:00.000Z");
  });

  it("rejects invalid expressions", () => {
    expect(nextCronOccurrence("not a cron", TZ, new Date())).toBeNull();
    expect(nextCronOccurrence("0 9 * *", TZ, new Date())).toBeNull();
    expect(nextCronOccurrence("99 9 * * *", TZ, new Date())).toBeNull();
  });
});

describe("occurrenceKeyFor", () => {
  it("birthday keys are per-day (one greeting per year)", () => {
    const key = occurrenceKeyFor({
      triggerType: "BIRTHDAY",
      scheduledFor: new Date("2026-03-15T08:00:00Z"),
    });
    expect(key).toBe("birthday-2026-03-15");
  });

  it("no-contact keys embed the inactivity episode", () => {
    const last = new Date("2026-01-01T10:00:00Z");
    const a = occurrenceKeyFor({
      triggerType: "NO_CONTACT_FOR",
      scheduledFor: new Date(),
      lastInteractionAt: last,
    });
    const b = occurrenceKeyFor({
      triggerType: "NO_CONTACT_FOR",
      scheduledFor: new Date(Date.now() + 3600_000),
      lastInteractionAt: last,
    });
    expect(a).toBe(b); // same episode ⇒ same key ⇒ one reminder
    const afterNewInteraction = occurrenceKeyFor({
      triggerType: "NO_CONTACT_FOR",
      scheduledFor: new Date(),
      lastInteractionAt: new Date("2026-02-01T10:00:00Z"),
    });
    expect(afterNewInteraction).not.toBe(a);
  });
});
