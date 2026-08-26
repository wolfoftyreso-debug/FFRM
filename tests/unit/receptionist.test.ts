import { describe, expect, it } from "vitest";
import { isOwnerAjour } from "@/lib/voice/receptionist-config";

const config = {
  availabilityMode: "AUTO" as const,
  workStart: "08:00",
  workEnd: "17:00",
  activeWindowMinutes: 15,
};

describe("AI receptionist availability", () => {
  it("is ajour during work hours after recent app activity", () => {
    const now = new Date("2026-08-26T10:00:00Z"); // Wednesday 12:00 Stockholm
    expect(
      isOwnerAjour({
        config,
        timezone: "Europe/Stockholm",
        now,
        lastActiveAt: new Date(now.getTime() - 14 * 60_000),
      }),
    ).toMatchObject({ available: true });
  });

  it("is not ajour when activity is stale or outside weekdays", () => {
    const weekday = new Date("2026-08-26T10:00:00Z");
    expect(
      isOwnerAjour({
        config,
        timezone: "Europe/Stockholm",
        now: weekday,
        lastActiveAt: new Date(weekday.getTime() - 16 * 60_000),
      }).available,
    ).toBe(false);
    const saturday = new Date("2026-08-29T10:00:00Z");
    expect(
      isOwnerAjour({
        config,
        timezone: "Europe/Stockholm",
        now: saturday,
        lastActiveAt: saturday,
      }).available,
    ).toBe(false);
  });

  it("honors explicit ajour and not-ajour modes", () => {
    expect(
      isOwnerAjour({
        config: { ...config, availabilityMode: "AJOUR" },
        lastActiveAt: null,
      }).available,
    ).toBe(true);
    expect(
      isOwnerAjour({
        config: { ...config, availabilityMode: "NOT_AJOUR" },
        lastActiveAt: new Date(),
      }).available,
    ).toBe(false);
  });
});
