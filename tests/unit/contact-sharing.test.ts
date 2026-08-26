import { describe, expect, it } from "vitest";
import { buildVCard } from "@/lib/contact-sharing";

describe("buildVCard", () => {
  it("creates a standards-compatible downloadable contact", () => {
    const card = buildVCard({
      name: "Erik Svensson",
      firstName: "Erik",
      lastName: "Svensson",
      phoneNumber: "+46709123223",
      email: "erik@example.com",
      birthday: "1980-05-10",
      company: "Landvex",
      jobTitle: "Grundare",
      photoDataBase64: "aGVq",
      photoMimeType: "image/jpeg",
    });
    expect(card).toContain("BEGIN:VCARD\r\nVERSION:3.0");
    expect(card).toContain("FN:Erik Svensson");
    expect(card).toContain("TEL;TYPE=CELL:+46709123223");
    expect(card).toContain("EMAIL;TYPE=INTERNET:erik@example.com");
    expect(card).toContain("N:Svensson;Erik;;;");
    expect(card).toContain("BDAY:1980-05-10");
    expect(card).toContain("ORG:Landvex");
    expect(card).toContain("PHOTO;ENCODING=b;TYPE=JPEG:aGVq");
    expect(card).toMatch(/END:VCARD\r\n$/);
  });

  it("escapes vCard control characters", () => {
    const card = buildVCard({
      name: "Svensson, Erik; AB",
      firstName: "Erik",
      lastName: "Svensson",
      phoneNumber: null,
      email: null,
      photoDataBase64: null,
      photoMimeType: null,
    });
    expect(card).toContain("FN:Svensson\\, Erik\\; AB");
  });
});
