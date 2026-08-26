import { buildVCard, getContactCard } from "@/lib/contact-sharing";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const contact = await getContactCard(id);
  if (!contact) return new Response("not found", { status: 404 });
  return new Response(buildVCard(contact), {
    headers: {
      "content-type": "text/vcard; charset=utf-8",
      "content-disposition": 'attachment; filename="contact.vcf"',
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
