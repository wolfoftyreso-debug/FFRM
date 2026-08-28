import { NextRequest, NextResponse } from "next/server";
import { runDispatcher } from "@/lib/automations/dispatcher";
import { requireEnv } from "@/lib/env";
import { logActivity } from "@/lib/activity";

export const maxDuration = 300;

/**
 * Central scheduler endpoint, invoked by Vercel Cron every minute
 * (see vercel.json). Protected by CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = requireEnv("CRON_SECRET");
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  try {
    const summary = await runDispatcher();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    try {
      await logActivity({
        actor: "SYSTEM",
        action: "CRON_FAILED",
        summary: `Cron dispatcher failed: ${message.slice(0, 300)}`,
      });
    } catch {
      // If even logging fails (e.g. database down), surface the error only.
    }
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
