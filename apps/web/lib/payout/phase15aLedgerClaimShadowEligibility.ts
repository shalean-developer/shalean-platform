import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";
import {
  BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY,
  bookingPayableForWeeklyBatch,
  type BookingRowForWeeklyBatchEligibility,
} from "@/lib/payout/bookingPayableForWeeklyBatch";
import { bookingUsesAccrualPayoutCap } from "@/lib/payout/bookingPayoutCapCents";

/** Context field and log source for Phase 15A shadow runs (measurement only). */
export const PHASE15A_SHADOW_ELIGIBILITY_SOURCE = "phase15a_shadow_eligibility";

/**
 * Phase 15A measurement only. Do not enforce here until Phase 15B/15C sign-off.
 *
 * Before `claim_cleaner_earnings_for_paystack`, evaluates the same predicate family as
 * {@link bookingPayableForWeeklyBatch} for each **approved**, unassigned ledger row for this cleaner.
 * Logs + metrics on mismatch; **never** throws, filters rows, or mutates payout state.
 */
export async function measurePhase15aLedgerClaimShadowEligibility(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<void> {
  const cid = cleanerId.trim();
  if (!cid) return;

  const { data: ceRows, error: ceErr } = await admin
    .from("cleaner_earnings")
    .select("id, booking_id, cleaner_id, status, disbursement_id")
    .eq("cleaner_id", cid)
    .eq("status", "approved")
    .is("disbursement_id", null);

  if (ceErr) {
    void logSystemEvent({
      level: "warn",
      source: PHASE15A_SHADOW_ELIGIBILITY_SOURCE,
      message: "shadow_measurement_cleaner_earnings_select_failed",
      context: { cleaner_id: cid, error: ceErr.message },
    });
    return;
  }

  const earnings = (ceRows ?? []) as {
    id?: string;
    booking_id?: string | null;
    cleaner_id?: string | null;
    status?: string | null;
    disbursement_id?: string | null;
  }[];

  const bookingIds = [
    ...new Set(
      earnings
        .map((e) => String(e.booking_id ?? "").trim())
        .filter((id) => /^[0-9a-f-]{36}$/i.test(id)),
    ),
  ];
  if (!bookingIds.length) return;

  const bookingSelect = `${BOOKING_SELECT_FIELDS_FOR_WEEKLY_BATCH_ELIGIBILITY}, payment_state, is_test`;
  const { data: bookingRows, error: bErr } = await admin.from("bookings").select(bookingSelect).in("id", bookingIds);

  if (bErr) {
    void logSystemEvent({
      level: "warn",
      source: PHASE15A_SHADOW_ELIGIBILITY_SOURCE,
      message: "shadow_measurement_bookings_select_failed",
      context: { cleaner_id: cid, error: bErr.message },
    });
    return;
  }

  const byBookingId = new Map<string, Record<string, unknown>>();
  for (const r of bookingRows ?? []) {
    const row = r as { id?: string };
    if (typeof row.id === "string") byBookingId.set(row.id, r as Record<string, unknown>);
  }

  const invoiceIds = new Set<string>();
  for (const bid of bookingIds) {
    const raw = byBookingId.get(bid);
    if (!raw) continue;
    const b = raw as BookingRowForWeeklyBatchEligibility;
    if (bookingUsesAccrualPayoutCap(b)) {
      const mid = String(b.monthly_invoice_id ?? "").trim();
      if (mid) invoiceIds.add(mid);
    }
  }

  const invoiceStatusById = new Map<string, string>();
  if (invoiceIds.size > 0) {
    const { data: invRows, error: invErr } = await admin
      .from("monthly_invoices")
      .select("id, status")
      .in("id", [...invoiceIds]);
    if (invErr) {
      void logSystemEvent({
        level: "warn",
        source: PHASE15A_SHADOW_ELIGIBILITY_SOURCE,
        message: "shadow_measurement_monthly_invoices_select_failed",
        context: { cleaner_id: cid, error: invErr.message },
      });
    } else {
      for (const ir of invRows ?? []) {
        const row = ir as { id?: string; status?: string | null };
        if (typeof row.id === "string") invoiceStatusById.set(row.id, String(row.status ?? ""));
      }
    }
  }

  for (const ce of earnings) {
    const bid = String(ce.booking_id ?? "").trim();
    if (!bid) continue;
    const rawBooking = byBookingId.get(bid);
    if (!rawBooking) {
      void logSystemEvent({
        level: "info",
        source: PHASE15A_SHADOW_ELIGIBILITY_SOURCE,
        message: "shadow_measurement_booking_row_missing_for_earning",
        context: {
          cleaner_id: cid,
          cleaner_earning_id: ce.id ?? null,
          booking_id: bid,
          disbursement_id: ce.disbursement_id ?? null,
        },
      });
      metrics.increment("cleaner.phase15a_shadow_ledger_claim_mismatch", {
        reason: "booking_row_missing",
        booking_id: bid,
        cleaner_id: cid,
        cleaner_earning_id: ce.id ?? null,
      });
      continue;
    }

    const booking = rawBooking as BookingRowForWeeklyBatchEligibility & {
      payment_state?: string | null;
      is_test?: boolean | null;
    };

    if (booking.is_test === true) continue;

    const gate = bookingPayableForWeeklyBatch(booking, invoiceStatusById);
    if (gate.payable) continue;

    void logSystemEvent({
      level: "info",
      source: PHASE15A_SHADOW_ELIGIBILITY_SOURCE,
      message: "ledger_claim_would_fail_future_booking_authority_rules",
      context: {
        booking_id: bid,
        cleaner_id: cid,
        cleaner_earning_id: ce.id ?? null,
        disbursement_id: ce.disbursement_id ?? null,
        payout_status: booking.payout_status ?? null,
        payment_status: booking.payment_status ?? null,
        payment_state: booking.payment_state ?? null,
        reason: gate.reason,
      },
    });

    metrics.increment("cleaner.phase15a_shadow_ledger_claim_mismatch", {
      reason: gate.reason,
      booking_id: bid,
      cleaner_id: cid,
      cleaner_earning_id: ce.id ?? null,
    });
  }
}
