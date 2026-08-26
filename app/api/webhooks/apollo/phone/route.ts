import { NextRequest, NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import { applyApolloPhonePayload } from "@/lib/apollo/service";
import { cleanErrorMessage } from "@/lib/errors";

/**
 * Apollo delivers mobile/direct-dial numbers asynchronously after
 * reveal_phone_number enrichment. Retries are idempotent by person id.
 */
export async function POST(req: NextRequest) {
  const expected = optionalEnv("WEBHOOK_TOKEN");
  if (expected && req.nextUrl.searchParams.get("token") !== expected) {
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
