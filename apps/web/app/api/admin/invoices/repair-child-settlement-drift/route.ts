import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { repairPaidMonthlyInvoiceChildSettlementDrift } from "@/lib/monthlyInvoice/repairPaidMonthlyInvoiceChildSettlementDrift";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 3A.3: bounded repair for paid monthly invoices whose non-cancelled child bookings
 * are not fully settled. Optional JSON `{ repairLimit?, scanLimit? }` (clamped).
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as {
    repairLimit?: unknown;
    scanLimit?: unknown;
  };
  const repairLimit = typeof body.repairLimit === "number" ? body.repairLimit : undefined;
  const scanLimit = typeof body.scanLimit === "number" ? body.scanLimit : undefined;

  const result = await repairPaidMonthlyInvoiceChildSettlementDrift(admin, { repairLimit, scanLimit });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { ok: _ok, ...repairBody } = result;
  return NextResponse.json({ ok: true as const, ...repairBody });
}
