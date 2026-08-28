import { describe, expect, it } from "vitest";
import {
  decideCallRouting,
  isNight,
  DEFAULT_GLOBAL_CALL_POLICY,
} from "@/lib/voice/policy";
import type { Contact } from "@/lib/db/schema";

const TZ = "Europe/Stockholm";
// 14:32 local (CEST) on a June day / 23:30 local at night.
const DAYTIME = new Date("2026-06-10T12:32:00Z");
const NIGHT = new Date("2026-06-10T21:30:00Z");

function contact(
  overrides: Partial<
    Pick<Contact, "callPolicy" | "relationshipVector" | "timezone" | "firstName">
  > = {},
) {
  return {
    firstName: "Johan",
    callPolicy: "INHERIT" as const,
    relationshipVector: null,
    timezone: TZ,
    ...overrides,
  };
}

describe("isNight", () => {
  it("detects the wrapping night window", () => {
    expect(isNight(NIGHT, TZ, "22:00", "07:00")).toBe(true);
    expect(isNight(DAYTIME, TZ, "22:00", "07:00")).toBe(false);
  });
});

describe("decideCallRouting", () => {
  it("known contacts ring through in the daytime", () => {
    const d = decideCallRouting({
      contact: contact(),
      isBlocked: false,
      globalPolicy: null,
      now: DAYTIME,
      timezone: TZ,
    });
    expect(d.disposition).toBe("RING_THROUGH");
  });

  it("unknown callers are screened", () => {
    const d = decideCallRouting({
      contact: null,
      isBlocked: false,
      globalPolicy: null,
      now: DAYTIME,
      timezone: TZ,
    });
    expect(d.disposition).toBe("SCREEN");
  });

  it("night downgrades ring-through to voicemail", () => {
    const d = decideCallRouting({
      contact: contact(),
      isBlocked: false,
      globalPolicy: null,
      now: NIGHT,
      timezone: TZ,
    });
    expect(d.disposition).toBe("VOICEMAIL");
  });

  it("inner-circle call-through priority pierces the night rule", () => {
    const d = decideCallRouting({
      contact: contact({
        relationshipVector: { callThroughPriority: 90 },
      }),
      isBlocked: false,
      globalPolicy: null,
      now: NIGHT,
      timezone: TZ,
    });
    expect(d.disposition).toBe("RING_THROUGH");
  });

  it("contact overrides beat the global policy", () => {
    expect(
      decideCallRouting({
        contact: contact({ callPolicy: "ALWAYS_RING_THROUGH" }),
        isBlocked: false,
        globalPolicy: null,
        now: NIGHT,
        timezone: TZ,
      }).disposition,
    ).toBe("RING_THROUGH");
    expect(
      decideCallRouting({
        contact: contact({ callPolicy: "VOICEMAIL" }),
        isBlocked: false,
        globalPolicy: null,
        now: DAYTIME,
        timezone: TZ,
      }).disposition,
    ).toBe("VOICEMAIL");
    expect(
      decideCallRouting({
        contact: contact({ callPolicy: "SCREEN" }),
        isBlocked: false,
        globalPolicy: null,
        now: DAYTIME,
        timezone: TZ,
      }).disposition,
    ).toBe("SCREEN");
  });

  it("RING_THROUGH_DAYTIME respects the night window", () => {
    expect(
      decideCallRouting({
        contact: contact({ callPolicy: "RING_THROUGH_DAYTIME" }),
        isBlocked: false,
        globalPolicy: null,
        now: DAYTIME,
        timezone: TZ,
      }).disposition,
    ).toBe("RING_THROUGH");
    expect(
      decideCallRouting({
        contact: contact({ callPolicy: "RING_THROUGH_DAYTIME" }),
        isBlocked: false,
        globalPolicy: null,
        now: NIGHT,
        timezone: TZ,
      }).disposition,
    ).toBe("VOICEMAIL");
  });

  it("blocked numbers and BLOCK policy are rejected", () => {
    expect(
      decideCallRouting({
        contact: contact(),
        isBlocked: true,
        globalPolicy: null,
        now: DAYTIME,
        timezone: TZ,
      }).disposition,
    ).toBe("REJECT");
    expect(
      decideCallRouting({
        contact: contact({ callPolicy: "BLOCK" }),
        isBlocked: false,
        globalPolicy: null,
        now: DAYTIME,
        timezone: TZ,
      }).disposition,
    ).toBe("REJECT");
  });

  it("custom global policy is honored", () => {
    const d = decideCallRouting({
      contact: null,
      isBlocked: false,
      globalPolicy: { ...DEFAULT_GLOBAL_CALL_POLICY, unknownCallers: "VOICEMAIL" },
      now: DAYTIME,
      timezone: TZ,
    });
    expect(d.disposition).toBe("VOICEMAIL");
  });
});
