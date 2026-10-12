import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * AUDIT-03A02-01: retired legacy booking-level payout settlement.
 *
 * Cleaner payouts are settled through the governed monthly cleaner_payouts
 * workflow and bank-transfer settlement path. This legacy endpoint used to
 * stamp bookings.payout_status directly, bypassing monthly payout settlement
 * truth and per-cleaner roster/team rails.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  return NextResponse.json(
    {
      ok: false as const,
      error: "legacy_mark_paid_retired",
      message:
        "Direct booking-level payout settlement is retired. Use the monthly Office payout workflow and bank-transfer settlement.",
    },
    { status: 410 },
  );
}
