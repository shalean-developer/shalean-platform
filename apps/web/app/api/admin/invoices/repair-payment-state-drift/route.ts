import { NextResponse } from "next/server";

import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { repairMonthlyInvoicePaymentStateDriftProbeE } from "@/lib/monthlyInvoice/repairMonthlyInvoicePaymentStateDriftProbeE";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 10D: same bounded repair as cron; admin-only. Optional JSON `{ repairLimit?, scanLimit? }` (clamped).
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

  const result = await repairMonthlyInvoicePaymentStateDriftProbeE(admin, { repairLimit, scanLimit });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const { ok: _ok, ...repairBody } = result;
  return NextResponse.json({ ok: true as const, ...repairBody });
}
