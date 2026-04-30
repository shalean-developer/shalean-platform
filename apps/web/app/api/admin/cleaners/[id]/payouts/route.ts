import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id: cleanerId } = await ctx.params;
  if (!cleanerId) return NextResponse.json({ error: "Missing cleaner id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: cleaner, error: cErr } = await admin.from("cleaners").select("id, full_name").eq("id", cleanerId).maybeSingle();
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if (!cleaner) return NextResponse.json({ error: "Cleaner not found." }, { status: 404 });

  const { data: payouts, error: pErr } = await admin
    .from("cleaner_payouts")
    .select(
      "id, total_amount_cents, status, payment_status, payment_reference, period_start, period_end, payout_run_id, created_at, approved_at, paid_at",
    )
    .eq("cleaner_id", cleanerId)
    .order("created_at", { ascending: false })
    .limit(120);

  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });

  const payoutIds = (payouts ?? []).map((p) => String((p as { id?: string }).id ?? "")).filter(Boolean);
  const bookingCounts = new Map<string, number>();
  if (payoutIds.length) {
    const { data: bks } = await admin.from("bookings").select("payout_id").in("payout_id", payoutIds);
    for (const b of bks ?? []) {
      const pid = String((b as { payout_id?: string | null }).payout_id ?? "");
      if (pid) bookingCounts.set(pid, (bookingCounts.get(pid) ?? 0) + 1);
    }
  }

  const rows = (payouts ?? []).map((p) => {
    const row = p as {
      id: string;
      total_amount_cents: number;
      status: string;
      payment_status?: string | null;
      payment_reference?: string | null;
      period_start: string;
      period_end: string;
      payout_run_id?: string | null;
      created_at: string;
      approved_at?: string | null;
      paid_at?: string | null;
    };
    return {
      ...row,
      booking_count: bookingCounts.get(row.id) ?? 0,
    };
  });

  return NextResponse.json({
    cleaner: {
      id: (cleaner as { id: string }).id,
      full_name: String((cleaner as { full_name?: string | null }).full_name ?? "").trim() || cleanerId,
    },
    payouts: rows,
  });
}
