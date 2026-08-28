import { NextResponse } from "next/server";
import { getLiveVersion } from "@/lib/live";

export const dynamic = "force-dynamic";

/**
 * The change signal behind live updates: one cheap fingerprint of every
 * operational surface. The client re-renders only when it moves, so this
 * endpoint stays small enough to poll while the app is open.
 */
export async function GET() {
  try {
    const version = await getLiveVersion();
    return NextResponse.json(
      { version },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    // A database blip must never take the app down; the client backs off.
    return NextResponse.json(
      { error: "unavailable" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
