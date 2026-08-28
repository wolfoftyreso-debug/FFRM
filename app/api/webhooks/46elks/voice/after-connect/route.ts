import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleAfterConnect } from "@/lib/voice/service";
import { webhookRequestIsAuthorized } from "@/lib/webhooks/auth";
import { touchSystemState } from "@/lib/system-state";

const schema = z.object({
  callid: z.string().min(1),
  result: z.string().optional(),
});

/**
 * `next` webhook after the connect action: success = call answered and done;
 * failed = no answer/busy → fall through to voicemail.
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

  const action = await handleAfterConnect(parsed.callid, parsed.result ?? "failed");
  return NextResponse.json(action);
}
