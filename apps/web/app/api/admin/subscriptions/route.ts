import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 2A: legacy subscriptions admin API retired — use `/api/admin/recurring`. */
export async function GET() {
  return NextResponse.json({ error: "deprecated" }, { status: 410 });
}

export async function PATCH() {
  return NextResponse.json({ error: "deprecated" }, { status: 410 });
}
