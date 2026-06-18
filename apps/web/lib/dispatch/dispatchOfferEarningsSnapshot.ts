import type { SupabaseClient } from "@supabase/supabase-js";
import {
  computeCleanerOfferEarningsSnapshot,
  type ComputeCleanerOfferEarningsSnapshotResult,
} from "@/lib/payout/computeCleanerOfferEarningsSnapshot";
import { logSystemEvent } from "@/lib/logging/systemLog";

/**
 * Columns we need from `bookings` to compute the per-offer snapshot. Keep in
 * sync with the projection in `loadBookingForOfferEarningsSnapshot`.
 */
export const BOOKING_SNAPSHOT_SELECT =
  "id, service, date, time, is_team_job, team_member_count_snapshot, base_amount_cents, service_fee_cents, total_paid_zar, total_paid_cents, amount_paid_cents, price_snapshot, booking_snapshot";

export type ResolveAndPersistDispatchOfferEarningsParams = {
  supabase: SupabaseClient;
  bookingId: string;
  cleanerId: string;
  offerId: string;
};

export type ResolveAndPersistDispatchOfferEarningsResult = {
  /** Cents written to `dispatch_offers.display_earnings_cents`, or null when the snapshot couldn't be resolved. */
  amountCents: number | null;
  /** {@link OFFER_EARNINGS_SOURCE} or `"missing_inputs"` (when the booking / cleaner row was unreadable). */
  source: string;
  /** Stable miss code; null on success. */
  missingReason: string | null;
};

/**
 * Best-effort: compute the per-offer cleaner share snapshot and persist it on
 * `dispatch_offers`. Never throws; never blocks dispatch. On miss, returns the
 * stable diagnostic source so the caller can emit a structured `system_logs`
 * event for the data-integrity dashboard.
 *
 * This is the canonical "earning persisted before offer is shown" path
 * (point 7 of the cleaner-offer earnings audit). The offers route reads the
 * snapshot before falling back to the runtime preview helper.
 */
export async function resolveAndPersistDispatchOfferEarningsSnapshot(
  params: ResolveAndPersistDispatchOfferEarningsParams,
): Promise<ResolveAndPersistDispatchOfferEarningsResult> {
  const { supabase, bookingId, cleanerId, offerId } = params;

  const [{ data: bookingRow, error: bookingErr }, { data: cleanerRow, error: cleanerErr }] = await Promise.all([
    supabase.from("bookings").select(BOOKING_SNAPSHOT_SELECT).eq("id", bookingId).maybeSingle(),
    supabase.from("cleaners").select("id, joined_at, created_at").eq("id", cleanerId).maybeSingle(),
  ]);

  if (bookingErr || !bookingRow || cleanerErr || !cleanerRow) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_earnings_snapshot_inputs_missing",
      message: "Could not load booking + cleaner rows for snapshot",
      context: {
        bookingId,
        cleanerId,
        offerId,
        bookingError: bookingErr?.message ?? null,
        cleanerError: cleanerErr?.message ?? null,
        bookingFound: bookingRow != null,
        cleanerFound: cleanerRow != null,
      },
    });
    return { amountCents: null, source: "missing_inputs", missingReason: "booking_or_cleaner_not_found" };
  }

  const snapshot: ComputeCleanerOfferEarningsSnapshotResult = computeCleanerOfferEarningsSnapshot({
    booking: bookingRow as Parameters<typeof computeCleanerOfferEarningsSnapshot>[0]["booking"],
    cleaner: cleanerRow as Parameters<typeof computeCleanerOfferEarningsSnapshot>[0]["cleaner"],
  });

  if (!snapshot.ok) {
    /** Always emit a structured diagnostic so we can group by service / payment-basis state in dashboards. */
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_earnings_snapshot_unresolved",
      message: snapshot.missingReason,
      context: {
        bookingId,
        cleanerId,
        offerId,
        source: snapshot.source,
        ...snapshot.diagnostics,
      },
    });
    /** Best-effort: still write the source so admins can grep stuck offers via the audit query. */
    await supabase
      .from("dispatch_offers")
      .update({
        earnings_snapshot_source: snapshot.source,
        earnings_snapshot_at: new Date().toISOString(),
      })
      .eq("id", offerId);
    return { amountCents: null, source: snapshot.source, missingReason: snapshot.missingReason };
  }

  /**
   * Snapshot writes are protected by `is null` to make them strictly additive:
   * if anyone (admin tool, race, manual repair) has already written a positive
   * value we never overwrite it. This matches the safety contract described
   * in the migration comment.
   */
  const nowIso = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("dispatch_offers")
    .update({
      display_earnings_cents: snapshot.amount_cents,
      earnings_snapshot_source: snapshot.source,
      earnings_snapshot_at: nowIso,
    })
    .eq("id", offerId)
    .is("display_earnings_cents", null);

  if (upErr) {
    await logSystemEvent({
      level: "warn",
      source: "dispatch_offer_earnings_snapshot_write_failed",
      message: upErr.message,
      context: {
        bookingId,
        cleanerId,
        offerId,
        source: snapshot.source,
        amount_cents: snapshot.amount_cents,
      },
    });
    return { amountCents: null, source: snapshot.source, missingReason: `write_failed:${upErr.message}` };
  }

  await logSystemEvent({
    level: "info",
    source: "dispatch_offer_earnings_snapshot_persisted",
    message: "Persisted per-offer cleaner earnings snapshot",
    context: {
      bookingId,
      cleanerId,
      offerId,
      source: snapshot.source,
      amount_cents: snapshot.amount_cents,
      ...snapshot.diagnostics,
    },
  });

  return { amountCents: snapshot.amount_cents, source: snapshot.source, missingReason: null };
}
