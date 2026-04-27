import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 2A: legacy subscriptions API retired — use `/api/me/recurring` and `recurring_bookings`. */
export async function GET() {
  return NextResponse.json({ error: "deprecated" }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: "deprecated" }, { status: 410 });
}
