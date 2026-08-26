import { describe, expect, it } from "vitest";
import {
  describeApolloFilters,
  filtersFromForm,
  normalizeApolloFilters,
  parseCsvList,
} from "@/lib/apollo/filters";
import {
  mapApolloPerson,
  parseApolloPhonePayload,
  pickBestPhone,
  toApolloSearchBody,
} from "@/lib/apollo/parse";

describe("Apollo filters", () => {
  it("parses comma lists and drops duplicates", () => {
    expect(parseCsvList("VD, vd, Stockholm\nGöteborg")).toEqual([
      "VD",
      "Stockholm",
      "Göteborg",
    ]);
  });

  it("normalizes titles, seniorities and geography", () => {
    const filters = filtersFromForm({
      titles: "VD, Inköpschef",
      seniorities: "c_suite, intern, unknown",
      personLocations: "Sverige, Stockholm",
      organizationLocations: "Norge",
      industries: "fastighet",
      keywords: "B2B",
      requirePhone: "true",
      limit: "40",
    });
    expect(filters.titles).toEqual(["VD", "Inköpschef"]);
    expect(filters.seniorities).toEqual(["c_suite", "intern"]);
    expect(filters.personLocations).toEqual(["Sverige", "Stockholm"]);
    expect(filters.requirePhone).toBe(true);
    expect(filters.limit).toBe(40);
    expect(describeApolloFilters(filters)).toContain("VD");
  });

  it("clamps fetch size and builds an Apollo search body", () => {
    const filters = normalizeApolloFilters({
      titles: ["CEO"],
      personLocations: ["Sweden"],
      seniorities: ["c_suite"],
      industries: ["saas"],
      keywords: "logistik",
      limit: 999,
    });
    expect(filters.limit).toBe(100);
    expect(toApolloSearchBody(filters)).toMatchObject({
      person_titles: ["CEO"],
      person_locations: ["Sweden"],
      person_seniorities: ["c_suite"],
      q_keywords: "logistik saas",
      per_page: 100,
    });
  });
});

describe("Apollo phone parsing", () => {
  it("maps a search person and prefers mobile numbers", () => {
    const person = mapApolloPerson({
      id: "p1",
      first_name: "Maya",
      last_name: "Ellison",
      title: "VD",
      has_direct_phone: true,
      organization: { name: "Lumen", primary_domain: "lumen.se", phone: "+468123456" },
      city: "Stockholm",
      country: "Sweden",
    });
    expect(person?.organizationName).toBe("Lumen");
    expect(person?.hasDirectPhone).toBe(true);

    const picked = pickBestPhone(
      [
        {
          sanitizedNumber: "+4685550100",
          rawNumber: "+46 8 555 0100",
          type: "work_direct",
          status: "valid_number",
        },
        {
          sanitizedNumber: "+46701112233",
          rawNumber: "070-111 22 33",
          type: "mobile",
          status: "valid_number",
        },
      ],
      person?.organizationPhone,
    );
    expect(picked).toEqual({ phone: "+46701112233", type: "mobile" });
  });

  it("reads native and nested webhook payloads", () => {
    const payload = parseApolloPhonePayload({
      webhook_result: {
        status: "success",
        credits_consumed: 8,
        people: [
          {
            id: "p1",
            status: "success",
            phone_numbers: [
              {
                sanitized_number: "+46701112233",
                raw_number: "+46 70 111 22 33",
                type_cd: "mobile",
                status_cd: "valid_number",
              },
            ],
          },
        ],
      },
    });
    expect(payload.creditsConsumed).toBe(8);
    expect(payload.people[0]?.phoneNumbers[0]?.type).toBe("mobile");
  });
});
