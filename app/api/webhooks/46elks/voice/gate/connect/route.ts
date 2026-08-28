import { NextRequest, NextResponse } from "next/server";
import { connectScreenedCall } from "@/lib/voice/receptionist";
import { webhookRequestIsAuthorized } from "@/lib/webhooks/auth";
import { touchSystemState } from "@/lib/system-state";

export async function POST(req: NextRequest) {
  if (!webhookRequestIsAuthorized(req)) {
    await touchSystemState("lastRejectedWebhookAt");
    return new NextResponse("unauthorized", { status: 401 });
  }
  const form = await req.formData().catch(() => new FormData());
  const callid =
    req.nextUrl.searchParams.get("callid") || String(form.get("callid") ?? "");
  if (!callid) return new NextResponse("bad request", { status: 400 });
  return NextResponse.json(
    await connectScreenedCall(
      callid,
      req.nextUrl.searchParams.get("afterHold") === "1",
    ),
  );
}
