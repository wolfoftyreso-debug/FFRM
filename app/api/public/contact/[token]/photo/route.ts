import { getSharedContact } from "@/lib/contact-sharing";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const contact = await getSharedContact(token);
  if (!contact?.photoDataBase64 || !contact.photoMimeType) {
    return new Response("not found", { status: 404 });
  }
  return new Response(Buffer.from(contact.photoDataBase64, "base64"), {
    headers: {
      "content-type": contact.photoMimeType,
      "cache-control": "public, max-age=300",
      "x-content-type-options": "nosniff",
    },
  });
}
