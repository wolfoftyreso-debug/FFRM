import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { optionalEnv } from "@/lib/env";

const deliverySchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1), // "delivered" | "failed"
  delivered: z.string().optional(),
});

/** Delivery report webhook from 46elks ("whendelivered"). */
export async function POST(req: NextRequest) {
  const expectedToken = optionalEnv("WEBHOOK_TOKEN");
  if (expectedToken) {
    const token = req.nextUrl.searchParams.get("token");
    if (token !== expectedToken) {
      return new NextResponse("unauthorized", { status: 401 });
    }
  }

  let parsed: z.infer<typeof deliverySchema>;
  try {
    const form = await req.formData();
    parsed = deliverySchema.parse(Object.fromEntries(form.entries()));
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  const db = await getDb();
  const isDelivered = parsed.status === "delivered";

  const updated = await db
    .update(messages)
    .set(
      isDelivered
        ? { status: "DELIVERED", deliveredAt: new Date() }
        : { status: "FAILED", failedAt: new Date(), error: `Delivery status: ${parsed.status}` },
    )
    .where(
      and(
        eq(messages.provider, "46elks"),
        eq(messages.direction, "OUTBOUND"),
        eq(messages.providerMessageId, parsed.id),
      ),
    )
    .returning({ id: messages.id, contactId: messages.contactId });

  if (updated[0] && !isDelivered) {
    await logActivity({
      actor: "46ELKS",
      action: "SMS_DELIVERY_FAILED",
      summary: `SMS delivery failed (${parsed.status})`,
      contactId: updated[0].contactId,
      entityType: "message",
      entityId: updated[0].id,
    });
  }

  return new NextResponse(null, { status: 200 });
}
