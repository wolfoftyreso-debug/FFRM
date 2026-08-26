import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { optionalEnv } from "@/lib/env";
import { decideGateAction } from "@/lib/voice/receptionist";

const schema = z.object({ callid: z.string().min(1) });

export async function POST(req: NextRequest) {
  const expected = optionalEnv("WEBHOOK_TOKEN");
  if (expected && req.nextUrl.searchParams.get("token") !== expected) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  try {
    const form = await req.formData();
    const { callid } = schema.parse(Object.fromEntries(form.entries()));
    const attempt = Math.max(
      1,
      Math.min(2, Number(req.nextUrl.searchParams.get("attempt")) || 1),
    );
    return NextResponse.json(await decideGateAction(callid, attempt));
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }
}
