import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ensureOwner } from "@/lib/auth/owner";
import { normalizeCompanyLogo } from "@/lib/contact-photo";

export async function GET() {
  await ensureOwner();
  const db = await getDb();
  const [owner] = await db.select().from(users).limit(1);
  if (!owner?.companyLogoDataBase64 || !owner.companyLogoMimeType) {
    return new Response("not found", { status: 404 });
  }
  return imageResponse(owner.companyLogoDataBase64, owner.companyLogoMimeType);
}

export async function POST(request: Request) {
  try {
    await ensureOwner();
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("Välj en logga.");
    const logo = await normalizeCompanyLogo(file);
    const db = await getDb();
    await db.update(users).set({
      companyLogoDataBase64: logo.dataBase64,
      companyLogoMimeType: logo.mimeType,
      updatedAt: sql`now()`,
    });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}

export async function DELETE() {
  await ensureOwner();
  const db = await getDb();
  await db.update(users).set({
    companyLogoDataBase64: null,
    companyLogoMimeType: null,
    updatedAt: sql`now()`,
  });
  return Response.json({ ok: true });
}

function imageResponse(dataBase64: string, mimeType: string) {
  return new Response(Buffer.from(dataBase64, "base64"), {
    headers: {
      "content-type": mimeType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
