import {
  calculateCleanerPayoutFromBookingRow,
  type CleanerPayoutResult,
} from "@/lib/payout/calculateCleanerPayout";
import { logSystemEvent, reportOperationalIssue } from "@/lib/logging/systemLog";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Persists payout columns once per booking (immutable after first successful write).
 * Call when a cleaner is assigned and payment total is known — e.g. from `notifyCleanerAssignedBooking`.
 */
export async function persistCleanerPayoutIfUnset(
  admin: SupabaseClient,
  bookingId: string,
  expectedCleanerId: string,
): Promise<{ ok: true; skipped: boolean; payout?: CleanerPayoutResult } | { ok: false; error: string }> {
  const { data: row, error: selErr } = await admin
    .from("bookings")
    .select(
      "id, cleaner_id, total_paid_zar, amount_paid_cents, base_amount_cents, service_fee_cents, service, booking_snapshot, cleaner_payout_cents",
    )
    .eq("id", bookingId)
    .maybeSingle();

  if (selErr || !row) {
    return { ok: false, error: selErr?.message ?? "Booking not found" };
  }

  const r = row as {
    cleaner_id?: string | null;
    cleaner_payout_cents?: number | null;
    total_paid_zar?: number | null;
    amount_paid_cents?: number | null;
    base_amount_cents?: number | null;
    service_fee_cents?: number | null;
    service?: string | null;
    booking_snapshot?: unknown;
  };

  if (String(r.cleaner_id ?? "") !== expectedCleanerId) {
    return { ok: true, skipped: true };
  }

  if (r.cleaner_payout_cents != null && Number.isFinite(Number(r.cleaner_payout_cents))) {
    return { ok: true, skipped: true };
  }

  const { data: cleaner, error: cErr } = await admin.from("cleaners").select("created_at").eq("id", expectedCleanerId).maybeSingle();

  if (cErr || !cleaner) {
    await reportOperationalIssue("warn", "persistCleanerPayoutIfUnset", `cleaner not found: ${cErr?.message ?? ""}`, {
      bookingId,
      cleanerId: expectedCleanerId,
    });
    return { ok: false, error: "Cleaner not found" };
  }

  const createdAt =
    cleaner && typeof cleaner === "object" && "created_at" in cleaner
      ? String((cleaner as { created_at?: string | null }).created_at ?? "")
      : "";

  const payout = calculateCleanerPayoutFromBookingRow({
    totalPaidZar: r.total_paid_zar,
    amountPaidCents: r.amount_paid_cents,
    baseAmountCents: r.base_amount_cents,
    serviceFeeCents: r.service_fee_cents,
    serviceLabel: r.service ?? null,
    bookingSnapshot: r.booking_snapshot ?? null,
    cleanerCreatedAtIso: createdAt || null,
  });

  const { data: updated, error: upErr } = await admin
    .from("bookings")
    .update({
      cleaner_payout_cents: payout.cleanerPayoutCents,
      company_revenue_cents: payout.companyRevenueCents,
      payout_percentage: payout.payoutPercentage,
      payout_type: payout.payoutType,
    })
    .eq("id", bookingId)
    .eq("cleaner_id", expectedCleanerId)
    .is("cleaner_payout_cents", null)
    .select("id");

  if (upErr) {
    await reportOperationalIssue("error", "persistCleanerPayoutIfUnset", upErr.message, { bookingId });
    return { ok: false, error: upErr.message };
  }

  if (!updated?.length) {
    return { ok: true, skipped: true };
  }

  console.log("PAYOUT_CALCULATED", {
    bookingId,
    cleanerPayout: payout.cleanerPayoutCents,
    companyRevenue: payout.companyRevenueCents,
    type: payout.payoutType,
    payoutBaseCents: payout.payoutBaseCents,
    serviceFeeCents: payout.serviceFeeCents,
  });

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_CALCULATED",
    message: "Cleaner payout persisted",
    context: {
      bookingId,
      cleanerId: expectedCleanerId,
      cleanerPayoutCents: payout.cleanerPayoutCents,
      companyRevenueCents: payout.companyRevenueCents,
      payoutType: payout.payoutType,
      payoutPercentage: payout.payoutPercentage,
      payoutBaseCents: payout.payoutBaseCents,
      serviceFeeCents: payout.serviceFeeCents,
    },
  });

  return { ok: true, skipped: false, payout };
}
