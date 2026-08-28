import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleIncomingCall } from "@/lib/voice/service";
import { voicemailAction } from "@/lib/voice/actions";
import { touchSystemState } from "@/lib/system-state";
import { webhookRequestIsAuthorized } from "@/lib/webhooks/auth";

const schema = z.object({
  callid: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  direction: z.string().optional(),
});

/**
 * 46elks voice_start webhook: an incoming call on the system's number.
 * The response body is the next call action (JSON).
 */
export async function POST(req: NextRequest) {
  if (!webhookRequestIsAuthorized(req)) {
    await touchSystemState("lastRejectedWebhookAt");
    return new NextResponse("unauthorized", { status: 401 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    const form = await req.formData();
    parsed = schema.parse(Object.fromEntries(form.entries()));
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  await touchSystemState("lastWebhookAt");

  try {
    const action = await handleIncomingCall(parsed);
    return NextResponse.json(action);
  } catch {
    // Routing failure must not hang up on the caller silently — take a message.
    return NextResponse.json(await voicemailAction("VOICEMAIL"));
  }
}
