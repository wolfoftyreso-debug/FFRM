import { describe, expect, it } from "vitest";
import { isE164, normalizePhoneNumber } from "@/lib/phone";

describe("normalizePhoneNumber", () => {
  it("converts Swedish national format to E.164", () => {
    expect(normalizePhoneNumber("0701234567")).toBe("+46701234567");
  });

  it("keeps already-canonical E.164 numbers", () => {
    expect(normalizePhoneNumber("+46701234567")).toBe("+46701234567");
  });

  it("strips spaces, dashes, dots and parentheses", () => {
    expect(normalizePhoneNumber("070-123 45 67")).toBe("+46701234567");
    expect(normalizePhoneNumber("(070) 123.45.67")).toBe("+46701234567");
  });

  it("converts 00-prefixed international numbers", () => {
    expect(normalizePhoneNumber("0046701234567")).toBe("+46701234567");
  });

  it("supports a custom default country prefix", () => {
    expect(normalizePhoneNumber("0171234567", "+47")).toBe("+47171234567");
  });

  it("rejects garbage", () => {
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber("hello")).toBeNull();
    expect(normalizePhoneNumber("+12")).toBeNull();
    expect(normalizePhoneNumber("+123456789012345678")).toBeNull();
  });
});

describe("isE164", () => {
  it("accepts valid numbers", () => {
    expect(isE164("+46701234567")).toBe(true);
  });
  it("rejects national format and junk", () => {
    expect(isE164("0701234567")).toBe(false);
    expect(isE164("+46 70 123")).toBe(false);
  });
});
