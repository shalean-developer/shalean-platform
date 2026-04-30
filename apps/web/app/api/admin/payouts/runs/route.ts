import { NextResponse } from "next/server";
import { listPayoutDisbursementRuns } from "@/lib/admin/payoutDisbursementRuns";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { createPayoutRun } from "@/lib/payout/runs/createPayoutRun";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const runs = await listPayoutDisbursementRuns(admin);
    return NextResponse.json({ runs });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const run = await createPayoutRun(admin);
    if (!run) return NextResponse.json({ ok: true, run: null, message: "No frozen payouts to batch." });
    return NextResponse.json({ ok: true, run });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
