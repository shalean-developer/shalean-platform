import { NextResponse } from "next/server";
import { getCleanerVisibleBookingsOrFilter } from "@/lib/cleaner/cleanerBookingAccess";
import { reconcileEarningsCardsWithLedger } from "@/lib/cleaner/earningsFinanceReconcile";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { metrics } from "@/lib/metrics/counters";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BookingRow = {
  id: string;
  payout_status: string | null;
  payout_frozen_cents: number | null;
  display_earnings_cents: number | null;
  cleaner_earnings_total_cents: number | null;
  cleaner_payout_cents: number | null;
};

/**
 * Authenticated cleaner only — compares last N completed-job **cards** (booking-derived cents) to
 * `cleaner_earnings` rows for the same booking ids. Use for finance / support; not for high-frequency polling.
 */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) {
    return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  }

  const { orFilter: visibilityOr } = await getCleanerVisibleBookingsOrFilter(admin, session.cleanerId);

  const url = new URL(request.url);
  const strict = String(url.searchParams.get("strict") ?? "").trim().toLowerCase() === "true";

  const { data: bookings, error } = await admin
    .from("bookings")
    .select(
      "id, payout_status, payout_frozen_cents, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents",
    )
    .or(visibilityOr)
    .eq("status", "completed")
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .limit(300);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (bookings ?? []) as BookingRow[];
  const ids = rows.map((b) => b.id).filter(Boolean);
  const ledgerByBooking = new Map<string, number>();

  if (ids.length > 0) {
    const { data: ledgerRows, error: leErr } = await admin
      .from("cleaner_earnings")
      .select("booking_id, amount_cents")
      .eq("cleaner_id", session.cleanerId)
      .in("booking_id", ids);
    if (leErr) {
      return NextResponse.json({ error: leErr.message }, { status: 500 });
    }
    for (const r of ledgerRows ?? []) {
      const row = r as { booking_id?: string; amount_cents?: number | null };
      const bid = String(row.booking_id ?? "").trim();
      if (!bid) continue;
      ledgerByBooking.set(bid, Math.max(0, Math.round(Number(row.amount_cents) || 0)));
    }
  }

  const cards = rows.map((b) => ({
    booking_id: b.id,
    amount_cents:
      resolveCleanerEarningsCents({
        cleaner_earnings_total_cents: b.cleaner_earnings_total_cents,
        payout_frozen_cents: b.payout_frozen_cents,
        display_earnings_cents: b.display_earnings_cents,
      }) ?? 0,
  }));

  const reconcile = reconcileEarningsCardsWithLedger(cards, ledgerByBooking, { strict });

  if (reconcile.invariant_failed) {
    metrics.increment("cleaner.earnings_invariant_mismatch", {
      compared_bookings: reconcile.compared_bookings,
      intersection_booking_count: reconcile.intersection_booking_count,
      amount_mismatch_booking_count: reconcile.amount_mismatch_booking_count,
      missing_ledger_row_count: reconcile.missing_ledger_row_count,
      sum_card_intersection_cents: reconcile.sum_card_intersection_cents,
      sum_ledger_intersection_cents: reconcile.sum_ledger_intersection_cents,
      delta_intersection_cents: reconcile.delta_intersection_cents,
      strict,
    });
  }

  return NextResponse.json({
    cleaner_id: session.cleanerId,
    ok: reconcile.ok,
    delta_intersection_cents: reconcile.delta_intersection_cents,
    strict,
    /** Same booking slice as `GET /api/cleaner/earnings` primary `rows`. */
    source: "bookings_completed_last_300_vs_cleaner_earnings_intersection",
    status_mapping: {
      note:
        "Booking payout_status uses eligible/pending/paid; cleaner_earnings uses approved for batched-ready rows — compare amounts on booking_id, not status strings.",
    },
    reconcile,
  });
}
