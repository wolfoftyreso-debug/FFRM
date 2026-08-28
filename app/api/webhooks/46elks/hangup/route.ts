import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleHangup } from "@/lib/voice/service";
import { optionalEnv } from "@/lib/env";

const schema = z.object({
  id: z.string().min(1),
  state: z.string().optional(),
  duration: z.string().optional(),
});

/** whenhangup webhook: final call state and duration. */
export async function POST(req: NextRequest) {
  const expectedToken = optionalEnv("WEBHOOK_TOKEN");
  if (expectedToken && req.nextUrl.searchParams.get("token") !== expectedToken) {
    return new NextResponse("unauthorized", { status: 401 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    const form = await req.formData();
    parsed = schema.parse(Object.fromEntries(form.entries()));
  } catch {
    return new NextResponse("bad request", { status: 400 });
  }

  await handleHangup({
    id: parsed.id,
    state: parsed.state,
    duration: parsed.duration ? Number(parsed.duration) : undefined,
  });
  return new NextResponse(null, { status: 200 });
}
