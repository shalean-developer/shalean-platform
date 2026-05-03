import { NextResponse } from "next/server";
import { fetchCleanerMeRow } from "@/lib/cleaner/cleanerMeDb";
import type { CleanerProfileSummaryJson } from "@/lib/cleaner/cleanerProfileSummaryTypes";
import { payoutArrivalSummaryJohannesburg } from "@/lib/cleaner/earnings/nextPayoutFriday";
import { resolveCleanerFromRequest } from "@/lib/cleaner/resolveCleanerFromRequest";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CACHE_CONTROL = "private, max-age=15, stale-while-revalidate=30";

export type { CleanerProfileSummaryJson } from "@/lib/cleaner/cleanerProfileSummaryTypes";

function maskAccountNumber(value: string | null | undefined): string | null {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `****${digits.slice(-4)}`;
}

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerFromRequest(request, admin);
  if (!session.ok) {
    return NextResponse.json(
      { error: session.error },
      { status: session.status, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cleanerId = session.cleaner.id;

  const [
    { data: cleaner, error: cleanerErr },
    { data: paymentRow, error: payErr },
    { data: failedRows, error: failedErr },
    { data: earningsRows, error: earnErr },
  ] = await Promise.all([
    fetchCleanerMeRow(admin, cleanerId),
    admin
      .from("cleaner_payment_details")
      .select("recipient_code, account_number, bank_code, account_name")
      .eq("cleaner_id", cleanerId)
      .maybeSingle(),
    admin
      .from("cleaner_payouts")
      .select("id")
      .eq("cleaner_id", cleanerId)
      .eq("status", "approved")
      .in("payment_status", ["failed", "partial_failed"])
      .limit(1),
    admin.from("cleaner_earnings").select("amount_cents").eq("cleaner_id", cleanerId).limit(10_000),
  ]);

  if (cleanerErr) {
    return NextResponse.json({ error: cleanerErr.message }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  if (!cleaner) {
    return NextResponse.json({ error: "Cleaner not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (payErr || failedErr || earnErr) {
    const msg = payErr?.message ?? failedErr?.message ?? earnErr?.message ?? "Query failed.";
    return NextResponse.json({ error: msg }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }

  const c = cleaner as Record<string, unknown>;
  const name = String(c.full_name ?? "").trim() || "—";
  const phone = String(c.phone_number ?? c.phone ?? "").trim();
  const email = String(c.email ?? "").trim();
  const status = c.status != null ? String(c.status).trim() : null;
  const is_available = c.is_available === true;

  const pr = paymentRow as {
    recipient_code?: string | null;
    account_number?: string | null;
    bank_code?: string | null;
    account_name?: string | null;
  } | null;
  const has_payment_method = Boolean(pr?.recipient_code?.trim());

  const has_failed_transfer = (failedRows ?? []).length > 0;

  let total_all_time_cents = 0;
  for (const row of earningsRows ?? []) {
    const r = row as { amount_cents?: unknown };
    total_all_time_cents += Math.max(0, Math.round(Number(r.amount_cents) || 0));
  }

  const asOf = new Date();
  const payout = payoutArrivalSummaryJohannesburg(asOf);

  const body: CleanerProfileSummaryJson = {
    name,
    phone,
    email,
    status,
    is_available,
    has_payment_method,
    has_failed_transfer,
    total_all_time_cents,
    payout_schedule_headline: payout.headline,
    payout_schedule_sub: payout.sub,
    account_number_masked: has_payment_method ? maskAccountNumber(pr?.account_number ?? null) : null,
    bank_code: has_payment_method ? (pr?.bank_code != null ? String(pr.bank_code).trim() || null : null) : null,
    account_name: has_payment_method ? (pr?.account_name != null ? String(pr.account_name).trim() || null : null) : null,
  };

  return NextResponse.json(body, { headers: { "Cache-Control": CACHE_CONTROL } });
}
