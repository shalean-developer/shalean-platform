import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  loadOfficePayoutPeriodReport,
  normalizeOfficePayoutPeriodRange,
} from "@/lib/admin/payouts/officePayoutPeriodReport";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const url = new URL(request.url);
  const { from, to } = normalizeOfficePayoutPeriodRange(
    url.searchParams.get("from"),
    url.searchParams.get("to"),
  );

  try {
    const report = await loadOfficePayoutPeriodReport(admin, from, to);
    return NextResponse.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to load payout period report.";
    console.error("[period-report]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
