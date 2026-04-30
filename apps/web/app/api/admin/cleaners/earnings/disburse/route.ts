import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { createCleanerEarningsDisbursement } from "@/lib/payout/createCleanerEarningsDisbursement";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { cleaner_id?: string };

/**
 * Claims approved ledger earnings for one cleaner, sends Paystack `/transfer`, and marks rows `paid` on `transfer.success`.
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const cleanerId = typeof body.cleaner_id === "string" ? body.cleaner_id.trim() : "";
  if (!/^[0-9a-f-]{36}$/i.test(cleanerId)) {
    return NextResponse.json({ error: "Provide a valid cleaner_id." }, { status: 400 });
  }

  const out = await createCleanerEarningsDisbursement(admin, cleanerId, { initiatedBy: auth.userId });
  if (!out.ok) {
    const status = out.status ?? (out.code === "no_approved_earnings" ? 400 : 500);
    return NextResponse.json({ error: out.error, code: out.code }, { status });
  }

  return NextResponse.json({
    ok: true,
    disbursement_id: out.disbursement_id,
    transfer_code: out.transfer_code,
    reference: out.reference,
    skipped: out.skipped === true,
  });
}
