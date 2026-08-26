import { beforeEach, describe, expect, it } from "vitest";
import { createTestDb, seedOwner } from "./helpers";
import type { Db } from "@/lib/db";
import {
  getOrCreateOwnerShareProfile,
  getSharedContact,
} from "@/lib/contact-sharing";
import { GET as downloadVCard } from "@/app/api/public/contact/[token]/vcard/route";

let db: Db;

describe("owner contact sharing", () => {
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("creates one durable unguessable share token", async () => {
    await seedOwner(db);
    const first = await getOrCreateOwnerShareProfile();
    const second = await getOrCreateOwnerShareProfile();
    expect(first?.shareToken).toMatch(/^[a-z0-9]{12,64}$/);
    expect(second?.shareToken).toBe(first?.shareToken);
    expect(await getSharedContact(first!.shareToken)).toMatchObject({
      name: "Testowner",
      shareToken: first!.shareToken,
    });
  });

  it("downloads the shared profile as a vCard", async () => {
    await seedOwner(db);
    const profile = await getOrCreateOwnerShareProfile();
    const response = await downloadVCard(new Request("http://localhost"), {
      params: Promise.resolve({ token: profile!.shareToken }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/vcard");
    expect(await response.text()).toContain("FN:Testowner");
  });

  it("does not reveal contacts for invalid tokens", async () => {
    await seedOwner(db);
    expect(await getSharedContact("not-valid!")).toBeNull();
    const response = await downloadVCard(new Request("http://localhost"), {
      params: Promise.resolve({ token: "missingtoken123" }),
    });
    expect(response.status).toBe(404);
  });
});
