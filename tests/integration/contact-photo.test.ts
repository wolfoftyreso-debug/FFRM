import { beforeEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import { createTestDb, seedContact, seedOwner } from "./helpers";
import type { Db } from "@/lib/db";
import { POST as uploadProfile, GET as getProfilePhoto } from "@/app/api/profile/photo/route";
import {
  POST as uploadContact,
  GET as getContactPhoto,
} from "@/app/api/contacts/[id]/photo/route";
import { GET as getContactVCard } from "@/app/api/contacts/[id]/vcard/route";

let db: Db;

describe("contact photos", () => {
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("normalizes and serves the owner photo", async () => {
    await seedOwner(db);
    const response = await uploadProfile(await photoRequest());
    expect(response.status).toBe(200);
    const image = await getProfilePhoto();
    expect(image.status).toBe(200);
    expect(image.headers.get("content-type")).toBe("image/jpeg");
    const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
    expect(metadata.width).toBe(512);
    expect(metadata.height).toBe(512);
  });

  it("includes a contact photo and standard fields in exported vCard", async () => {
    const owner = await seedOwner(db);
    const contact = await seedContact(db, owner.id, {
      profile: { company: "Landvex", jobTitle: "Projektledare" },
    });
    const params = { params: Promise.resolve({ id: contact.id }) };
    expect(await uploadContact(await photoRequest(), params)).toMatchObject({
      status: 200,
    });
    const image = await getContactPhoto(new Request("http://localhost"), params);
    expect(image.headers.get("content-type")).toBe("image/jpeg");
    const card = await getContactVCard(new Request("http://localhost"), params);
    const text = (await card.text()).replace(/\r\n /g, "");
    expect(text).toContain("N:Testsson;Johan;;;");
    expect(text).toContain("ORG:Landvex");
    expect(text).toContain("TITLE:Projektledare");
    expect(text).toContain("PHOTO;ENCODING=b;TYPE=JPEG:");
  });
});

async function photoRequest(): Promise<Request> {
  const form = new FormData();
  const image = await sharp({
    create: {
      width: 32,
      height: 48,
      channels: 3,
      background: { r: 30, g: 100, b: 180 },
    },
  })
    .png()
    .toBuffer();
  form.set(
    "photo",
    new File(
      [image],
      "photo.png",
      { type: "image/png" },
    ),
  );
  return new Request("http://localhost/upload", { method: "POST", body: form });
}
