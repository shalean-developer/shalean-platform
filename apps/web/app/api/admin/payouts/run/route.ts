import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  executeAllCleanersApprovedEarningsPaystack,
  executeCleanerApprovedEarningsPaystack,
} from "@/lib/payout/executeCleanerApprovedEarningsPaystack";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { cleaner_id?: string | null };

/**
 * Triggers Paystack payouts for **ledger** `cleaner_earnings` (approved → transfer → webhook `paid`).
 * Weekly `cleaner_payouts` batches use other routes (`/api/admin/payouts/[id]/pay`, payout runs).
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    /* empty body ok */
  }

  const cleanerId = typeof body.cleaner_id === "string" ? body.cleaner_id.trim() : "";
  if (cleanerId) {
    if (!/^[0-9a-f-]{36}$/i.test(cleanerId)) {
      return NextResponse.json({ error: "Provide a valid cleaner_id or omit for all cleaners." }, { status: 400 });
    }
    const r = await executeCleanerApprovedEarningsPaystack(admin, { cleanerId, initiatedBy: auth.userId });
    if (!r.ok) {
      return NextResponse.json(
        { error: r.error, code: r.code },
        { status: r.status ?? (r.code === "no_approved_earnings" ? 400 : 500) },
      );
    }
    return NextResponse.json({
      ok: true,
      scope: "cleaner",
      cleaner_id: cleanerId,
      disbursement_id: r.disbursement_id,
      transfer_code: r.transferCode,
      reference: r.reference,
      skipped: r.skipped === true,
    });
  }

  const batch = await executeAllCleanersApprovedEarningsPaystack(admin, { initiatedBy: auth.userId });
  return NextResponse.json({
    ok: true,
    scope: "all_cleaners_with_approved_earnings",
    cleaners_considered: batch.cleaners,
    results: batch.results,
  });
}
