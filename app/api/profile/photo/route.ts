import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { ensureOwner } from "@/lib/auth/owner";
import { normalizeContactPhoto } from "@/lib/contact-photo";

export async function GET() {
  await ensureOwner();
  const db = await getDb();
  const [owner] = await db.select().from(users).limit(1);
  if (!owner?.photoDataBase64 || !owner.photoMimeType) {
    return new Response("not found", { status: 404 });
  }
  return imageResponse(owner.photoDataBase64, owner.photoMimeType);
}

export async function POST(request: Request) {
  try {
    await ensureOwner();
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("Choose a photo");
    const photo = await normalizeContactPhoto(file);
    const db = await getDb();
    await db
      .update(users)
      .set({
        photoDataBase64: photo.dataBase64,
        photoMimeType: photo.mimeType,
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
  await db
    .update(users)
    .set({
      photoDataBase64: null,
      photoMimeType: null,
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
