import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { contacts } from "@/lib/db/schema";
import { normalizeContactPhoto } from "@/lib/contact-photo";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  const [contact] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.id, id))
    .limit(1);
  if (!contact?.photoDataBase64 || !contact.photoMimeType) {
    return new Response("not found", { status: 404 });
  }
  return new Response(Buffer.from(contact.photoDataBase64, "base64"), {
    headers: {
      "content-type": contact.photoMimeType,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const form = await request.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) throw new Error("Välj en bild.");
    const photo = await normalizeContactPhoto(file);
    const db = await getDb();
    const updated = await db
      .update(contacts)
      .set({
        photoDataBase64: photo.dataBase64,
        photoMimeType: photo.mimeType,
        updatedAt: sql`now()`,
      })
      .where(eq(contacts.id, id))
      .returning({ id: contacts.id });
    if (!updated.length) return new Response("not found", { status: 404 });
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "Upload failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const db = await getDb();
  const updated = await db
    .update(contacts)
    .set({
      photoDataBase64: null,
      photoMimeType: null,
      updatedAt: sql`now()`,
    })
    .where(eq(contacts.id, id))
    .returning({ id: contacts.id });
  return updated.length
    ? Response.json({ ok: true })
    : new Response("not found", { status: 404 });
}
