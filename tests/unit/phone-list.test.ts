import { describe, expect, it } from "vitest";
import {
  MAX_BROADCAST_RECIPIENTS,
  parsePhoneList,
  personalizeBroadcast,
} from "@/lib/sms/phone-list";

describe("parsePhoneList", () => {
  it("parses mixed separators, names and Swedish numbers", () => {
    const entries = parsePhoneList(
      [
        "0701234567, Anna Svensson",
        "+46 70-234 56 78\tBo",
        "0046703456789;Carla",
        "not-a-number",
        "# comment",
        "0701234567, Duplicate",
      ].join("\n"),
    );
    expect(entries).toEqual([
      { phoneNumber: "+46701234567", firstName: "Anna" },
      { phoneNumber: "+46702345678", firstName: "Bo" },
      { phoneNumber: "+46703456789", firstName: "Carla" },
    ]);
  });

  it("reads one number per line and skips junk", () => {
    expect(parsePhoneList("0709998877\nhello\n+46701112233")).toEqual([
      { phoneNumber: "+46709998877", firstName: null },
      { phoneNumber: "+46701112233", firstName: null },
    ]);
  });

  it("caps at MAX_BROADCAST_RECIPIENTS", () => {
    const raw = Array.from(
      { length: MAX_BROADCAST_RECIPIENTS + 25 },
      (_, i) => `070${String(1000000 + i).slice(1)}`,
    ).join("\n");
    expect(parsePhoneList(raw)).toHaveLength(MAX_BROADCAST_RECIPIENTS);
  });
});

describe("personalizeBroadcast", () => {
  it("leaves the template alone when personal is off", () => {
    expect(personalizeBroadcast("Hej *namn*", "Anna", false)).toBe(
      "Hej *namn*",
    );
  });

  it("replaces *namn* and *name* with the first name", () => {
    expect(personalizeBroadcast("Hej *namn*, *name*!", "Anna", true)).toBe(
      "Hej Anna, Anna!",
    );
  });

  it("replaces missing names with an empty string", () => {
    expect(personalizeBroadcast("Hej *namn*", null, true)).toBe("Hej");
  });
});
