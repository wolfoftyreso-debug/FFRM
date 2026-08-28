import { NextRequest, NextResponse } from "next/server";
import { applyApolloPhonePayload } from "@/lib/apollo/service";
import { cleanErrorMessage } from "@/lib/errors";
import { webhookRequestIsAuthorized } from "@/lib/webhooks/auth";
import { touchSystemState } from "@/lib/system-state";

/**
 * Apollo delivers mobile/direct-dial numbers asynchronously after
 * reveal_phone_number enrichment. Retries are idempotent by person id.
 */
export async function POST(req: NextRequest) {
  if (!webhookRequestIsAuthorized(req)) {
    await touchSystemState("lastRejectedWebhookAt");
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const payload = await req.json();
    const result = await applyApolloPhonePayload(payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: cleanErrorMessage(error, 240) },
      { status: 400 },
    );
  }
}
