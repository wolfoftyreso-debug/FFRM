import { NextRequest, NextResponse } from "next/server";
import { optionalEnv } from "@/lib/env";
import { connectScreenedCall } from "@/lib/voice/receptionist";

export async function POST(req: NextRequest) {
  const expected = optionalEnv("WEBHOOK_TOKEN");
  if (expected && req.nextUrl.searchParams.get("token") !== expected) {
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
