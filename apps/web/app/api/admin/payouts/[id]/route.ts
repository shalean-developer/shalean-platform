import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing payout id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: payout, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select("id, cleaner_id, total_amount_cents, status, payment_status, payment_reference, period_start, period_end, created_at, approved_at, approved_by, paid_at")
    .eq("id", id)
    .maybeSingle();

  if (payoutErr) return NextResponse.json({ error: payoutErr.message }, { status: 500 });
  if (!payout) return NextResponse.json({ error: "Payout not found." }, { status: 404 });

  const payoutRow = payout as { cleaner_id?: string | null };
  const cleanerId = String(payoutRow.cleaner_id ?? "");
  const [
    { data: cleaner },
    { data: bookings, error: bookingsErr },
    { data: transfers, error: transfersErr },
    { data: paymentDetails, error: paymentDetailsErr },
  ] = await Promise.all([
    cleanerId ? admin.from("cleaners").select("id, full_name, email, phone").eq("id", cleanerId).maybeSingle() : Promise.resolve({ data: null }),
    admin
      .from("bookings")
      .select("id, customer_name, service, date, total_paid_zar, amount_paid_cents, cleaner_payout_cents, cleaner_bonus_cents, company_revenue_cents, is_test")
      .eq("payout_id", id)
      .order("date", { ascending: true }),
    admin
      .from("payout_transfers")
      .select("id, amount_cents, recipient_code, transfer_code, status, error, webhook_processed_at, created_at")
      .eq("payout_id", id)
      .order("created_at", { ascending: false }),
    cleanerId
      ? admin.from("cleaner_payment_details").select("cleaner_id, recipient_code").eq("cleaner_id", cleanerId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (bookingsErr) return NextResponse.json({ error: bookingsErr.message }, { status: 500 });
  if (transfersErr) return NextResponse.json({ error: transfersErr.message }, { status: 500 });
  if (paymentDetailsErr) return NextResponse.json({ error: paymentDetailsErr.message }, { status: 500 });

  const hasRecipientCode = Boolean((paymentDetails as { recipient_code?: string | null } | null)?.recipient_code?.trim());

  return NextResponse.json({
    payout: {
      ...payout,
      cleaner_name: (cleaner as { full_name?: string | null } | null)?.full_name ?? cleanerId,
      cleaner_email: (cleaner as { email?: string | null } | null)?.email ?? null,
      cleaner_phone: (cleaner as { phone?: string | null } | null)?.phone ?? null,
    },
    bookings: bookings ?? [],
    transfers: transfers ?? [],
    paymentReadiness: {
      ready: hasRecipientCode,
      missingBankDetails: hasRecipientCode ? 0 : 1,
      reason: hasRecipientCode ? null : "Missing bank details",
      checkedAt: new Date().toISOString(),
    },
  });
}
