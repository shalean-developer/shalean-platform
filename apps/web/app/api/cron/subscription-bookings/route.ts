import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phase 2A: legacy subscriptions cron retired — use `generate-recurring-bookings` / `charge-recurring-bookings`. */
export async function POST() {
  return NextResponse.json({ ok: false, message: "Subscriptions deprecated" }, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ ok: false, message: "Subscriptions deprecated" }, { status: 410 });
}
