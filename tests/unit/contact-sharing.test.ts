import { describe, expect, it } from "vitest";
import { buildVCard } from "@/lib/contact-sharing";

describe("buildVCard", () => {
  it("creates a standards-compatible downloadable contact", () => {
    const card = buildVCard({
      name: "Erik Svensson",
      phoneNumber: "+46709123223",
      email: "erik@example.com",
      shareToken: "token123456789",
    });
    expect(card).toContain("BEGIN:VCARD\r\nVERSION:3.0");
    expect(card).toContain("FN:Erik Svensson");
    expect(card).toContain("TEL;TYPE=CELL:+46709123223");
    expect(card).toContain("EMAIL;TYPE=INTERNET:erik@example.com");
    expect(card).toMatch(/END:VCARD\r\n$/);
  });

  it("escapes vCard control characters", () => {
    const card = buildVCard({
      name: "Svensson, Erik; AB",
      phoneNumber: null,
      email: null,
      shareToken: "token123456789",
    });
    expect(card).toContain("FN:Svensson\\, Erik\\; AB");
  });
});
