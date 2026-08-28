import { and, eq, sql } from "drizzle-orm";
import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { messages } from "@/lib/db/schema";
import { getTwilioCredentials } from "@/lib/providers/config";
import { validateTwilioSignature } from "@/lib/providers/twilio-webhook";

export async function POST(request: NextRequest) {
  let credentials;
  try {
    credentials = await getTwilioCredentials();
  } catch {
    return new Response("Twilio är inte konfigurerat.", { status: 503 });
  }
  const raw = await request.text();
  const params = new URLSearchParams(raw);
  if (
    !validateTwilioSignature({
      authToken: credentials.authToken,
      url: request.url,
      params,
      signature: request.headers.get("x-twilio-signature"),
    })
  ) {
    return new Response("unauthorized", { status: 401 });
  }
  const sid = params.get("MessageSid");
  const status = params.get("MessageStatus")?.toLowerCase();
  if (!sid || !status) return new Response("bad request", { status: 400 });
  const db = await getDb();
  if (["failed", "undelivered"].includes(status)) {
    await db
      .update(messages)
      .set({
        status: "FAILED",
        failedAt: new Date(),
        error: `Twilio ${status}${
          params.get("ErrorCode") ? ` (${params.get("ErrorCode")})` : ""
        }`,
      })
      .where(
        and(
          eq(messages.provider, "twilio"),
          eq(messages.providerMessageId, sid),
        ),
      );
  } else if (["sent", "delivered", "read"].includes(status)) {
    await db
      .update(messages)
      .set({ status: "SENT", sentAt: sql`coalesce(${messages.sentAt}, now())` })
      .where(
        and(
          eq(messages.provider, "twilio"),
          eq(messages.providerMessageId, sid),
        ),
      );
  }
  return new Response(null, { status: 204 });
}
