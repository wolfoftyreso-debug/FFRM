import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import {
  createTestDb,
  seedOwner,
  uninstallMocks,
} from "./helpers";
import type { Db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { saveProviderConfig } from "@/lib/providers/config";
import {
  applyApolloPhonePayload,
  fetchApolloPhones,
  importApolloList,
  previewApolloAudience,
} from "@/lib/apollo/service";
import { POST as apolloPhoneWebhook } from "@/app/api/webhooks/apollo/phone/route";
import { eq } from "drizzle-orm";

let db: Db;
let originalFetch: typeof fetch;
let requests: { url: string; body: unknown }[];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Apollo people search and phone import", () => {
  beforeEach(async () => {
    db = await createTestDb();
    originalFetch = globalThis.fetch;
    requests = [];
    process.env.APP_URL = "https://phone.example";
    process.env.WEBHOOK_TOKEN = "webhook-test";
    await saveProviderConfig("apollo", { apiKey: "apollo-key" }, {
      revealPhoneNumbers: true,
      requirePhone: true,
      defaultLimit: 25,
    });
    globalThis.fetch = (async (input, init) => {
      const url = String(input);
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, body });
      if (url.includes("/mixed_people/api_search")) {
        return jsonResponse({
          total_entries: 2,
          people: [
            {
              id: "p1",
              first_name: "Erik",
              last_name: "Svensson",
              title: "VD",
              has_direct_phone: true,
              city: "Stockholm",
              country: "Sweden",
              organization: { name: "Landvex", primary_domain: "landvex.se" },
            },
            {
              id: "p2",
              first_name: "No",
              last_name: "Phone",
              title: "Intern",
              has_direct_phone: false,
            },
          ],
        });
      }
      if (url.includes("/people/bulk_match")) {
        return jsonResponse({
          request_id: "-123456789",
          credits_consumed: 1,
          matches: [
            {
              id: "p1",
              first_name: "Erik",
              last_name: "Svensson",
              title: "VD",
              organization: { name: "Landvex", phone: "+4685550100" },
            },
          ],
        });
      }
      return jsonResponse({ error: "unexpected" }, 404);
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.APP_URL;
    delete process.env.WEBHOOK_TOKEN;
    uninstallMocks();
  });

  it("previews a geographic target group and drops people without phones", async () => {
    const result = await previewApolloAudience({
      titles: ["VD"],
      seniorities: ["c_suite"],
      industries: [],
      personLocations: ["Sverige"],
      organizationLocations: [],
      keywords: "",
      includeSimilarTitles: true,
      requirePhone: true,
      limit: 25,
    });
    expect(result.total).toBe(2);
    expect(result.people).toHaveLength(1);
    expect(result.people[0]?.firstName).toBe("Erik");
    expect(requests[0]?.url).toContain("/mixed_people/api_search");
    expect(requests[0]?.body).toMatchObject({
      person_titles: ["VD"],
      person_locations: ["Sverige"],
    });
  });

  it("requests phone enrichment and imports the webhook number as a contact", async () => {
    const owner = await seedOwner(db);
    const fetched = await fetchApolloPhones({
      filters: {
        titles: ["VD"],
        seniorities: ["c_suite"],
        industries: [],
        personLocations: ["Stockholm"],
        organizationLocations: [],
        keywords: "",
        includeSimilarTitles: true,
        requirePhone: true,
        limit: 10,
      },
    });
    expect(fetched.list.status).toBe("ENRICHING");
    expect(requests.some((request) => request.url.includes("reveal_phone_number=true"))).toBe(
      true,
    );
    expect(requests.some((request) => request.url.includes("webhook_url="))).toBe(true);

    const webhook = await apolloPhoneWebhook(
      new NextRequest(
        "https://phone.example/api/webhooks/apollo/phone?token=webhook-test",
        {
          method: "POST",
          body: JSON.stringify({
            status: "success",
            credits_consumed: 8,
            people: [
              {
                id: "p1",
                status: "success",
                phone_numbers: [
                  {
                    sanitized_number: "+46701112233",
                    raw_number: "070-111 22 33",
                    type_cd: "mobile",
                    status_cd: "valid_number",
                  },
                ],
              },
            ],
          }),
        },
      ),
    );
    expect(webhook.status).toBe(200);
    const applied = await applyApolloPhonePayload({
      people: [],
    });
    expect(applied.updated).toBe(0);

    const imported = await importApolloList(fetched.list.id);
    expect(imported.imported).toBe(1);
    const [contact] = await db
      .select()
      .from(schema.contacts)
      .where(eq(schema.contacts.userId, owner.id));
    expect(contact.phoneNumber).toBe("+46701112233");
    expect(contact.relationshipType).toBe("WORK");
    expect(contact.profile?.company).toBe("Landvex");
  });

  it("rejects Apollo webhooks without the shared token", async () => {
    const response = await apolloPhoneWebhook(
      new NextRequest("https://phone.example/api/webhooks/apollo/phone", {
        method: "POST",
        body: JSON.stringify({ people: [] }),
      }),
    );
    expect(response.status).toBe(401);
  });
});
