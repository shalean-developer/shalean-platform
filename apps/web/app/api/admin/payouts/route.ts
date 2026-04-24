import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PayoutRow = {
  id: string;
  cleaner_id: string;
  total_amount_cents: number;
  status: string;
  payment_status?: string | null;
  payment_reference?: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
};

export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data, error } = await admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, total_amount_cents, status, payment_status, payment_reference, period_start, period_end, created_at, approved_at, paid_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const payouts = (data ?? []) as PayoutRow[];
  const cleanerIds = [...new Set(payouts.map((p) => p.cleaner_id).filter(Boolean))];
  const cleanerNames = new Map<string, string>();
  if (cleanerIds.length > 0) {
    const { data: cleaners } = await admin.from("cleaners").select("id, full_name").in("id", cleanerIds);
    for (const c of cleaners ?? []) {
      const row = c as { id?: string; full_name?: string | null };
      if (row.id) cleanerNames.set(row.id, row.full_name?.trim() || row.id);
    }
  }

  const payoutIds = payouts.map((p) => p.id);
  const bookingCounts = new Map<string, number>();
  if (payoutIds.length > 0) {
    const { data: bookings } = await admin.from("bookings").select("payout_id").in("payout_id", payoutIds);
    for (const b of bookings ?? []) {
      const payoutId = String((b as { payout_id?: string | null }).payout_id ?? "");
      if (payoutId) bookingCounts.set(payoutId, (bookingCounts.get(payoutId) ?? 0) + 1);
    }
  }

  return NextResponse.json({
    payouts: payouts.map((p) => ({
      ...p,
      cleaner_name: cleanerNames.get(p.cleaner_id) ?? p.cleaner_id,
      booking_count: bookingCounts.get(p.id) ?? 0,
    })),
  });
}
