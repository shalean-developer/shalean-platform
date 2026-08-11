import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { isClosedMonthlyPayoutBatchPeriod, isMonthlyPayoutBatchPeriod } from "@/lib/payout/monthBounds";
import { logPayoutAuditEvent } from "@/lib/payout/payoutAudit";
import { loadCleanerPayoutBatchItems } from "@/lib/payout/loadCleanerPayoutBatchItems";
import { loadCleanerPayoutFunding } from "@/lib/payout/payoutFunding";

export async function approveCleanerPayout(
  admin: SupabaseClient,
  params: { payoutId: string; approvedBy: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: payout, error: payoutErr } = await admin
    .from("cleaner_payouts")
    .select(
      "id, cleaner_id, total_amount_cents, calculated_amount_cents, adjustment_note, created_by, amount_adjusted_by, period_start, period_end",
    )
    .eq("id", params.payoutId)
    .maybeSingle();
  if (payoutErr) return { ok: false, error: payoutErr.message };
  if (!payout) return { ok: false, error: "Payout not found." };

  const periodStart = String((payout as { period_start?: string | null }).period_start ?? "").trim();
  const periodEnd = String((payout as { period_end?: string | null }).period_end ?? "").trim();
  if (isMonthlyPayoutBatchPeriod(periodStart, periodEnd) && !isClosedMonthlyPayoutBatchPeriod(periodStart, periodEnd)) {
    return {
      ok: false,
      error: "This monthly payout period is still open. Close the month before approving cleaner payouts.",
    };
  }

  const loaded = await loadCleanerPayoutBatchItems(admin, params.payoutId);
  if (loaded.error) return { ok: false, error: loaded.error };
  if (!loaded.items.length) return { ok: false, error: "Payout has no linked earning items." };
  if (loaded.items.some((item) => item.is_test)) {
    return { ok: false, error: "Cannot approve a payout batch containing test bookings." };
  }
  if (loaded.items.some((item) => item.booking_status !== "completed" || item.refunded_at)) {
    return { ok: false, error: "Payout contains an incomplete or refunded earning item." };
  }

  const funding = await loadCleanerPayoutFunding(admin, params.payoutId, loaded.items);
  if (funding.error || !funding.summary) {
    return { ok: false, error: funding.error ?? "Could not verify payout funding." };
  }
  if (funding.summary.fundingGapCents > 0) {
    return {
      ok: false,
      error: `Payout is not fully funded by collected customer cash. Funding gap: R ${(funding.summary.fundingGapCents / 100).toFixed(2)} across ${funding.summary.unfundedItemCount} earning item(s).`,
    };
  }

  const calculated = Math.max(0, Math.round(Number((payout as { calculated_amount_cents?: number }).calculated_amount_cents) || 0));
  if (calculated !== loaded.totalCents) {
    return { ok: false, error: "Payout calculated total does not match its linked earning items. Recalculate before approval." };
  }
  const total = Math.max(0, Math.round(Number((payout as { total_amount_cents?: number }).total_amount_cents) || 0));
  const note = String((payout as { adjustment_note?: string | null }).adjustment_note ?? "").trim();
  if (total !== calculated && note.length < 3) {
    return { ok: false, error: "Adjusted payout total requires an adjustment reason before approval." };
  }

  const cleanerId = String((payout as { cleaner_id?: string | null }).cleaner_id ?? "").trim();
  const { data: paymentDetails, error: paymentErr } = await admin
    .from("cleaner_payment_details")
    .select("recipient_code")
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  if (paymentErr) return { ok: false, error: paymentErr.message };
  if (!String((paymentDetails as { recipient_code?: string | null } | null)?.recipient_code ?? "").trim()) {
    return { ok: false, error: "Cleaner bank details are incomplete; Paystack recipient is missing." };
  }

  const createdBy = String((payout as { created_by?: string | null }).created_by ?? "").trim();
  const adjustedBy = String((payout as { amount_adjusted_by?: string | null }).amount_adjusted_by ?? "").trim();
  if (!createdBy) {
    return { ok: false, error: "Maker–checker: payout preparer is missing. Regenerate the batch before approval." };
  }
  if (createdBy === params.approvedBy) {
    return {
      ok: false,
      error: "Maker–checker: the admin who generated this payout cannot also approve it.",
    };
  }
  if (adjustedBy && adjustedBy === params.approvedBy) {
    return {
      ok: false,
      error: "Maker–checker: the admin who adjusted the amount cannot also approve it.",
    };
  }

  const patch = {
    status: "approved" as const,
    approved_at: new Date().toISOString(),
    approved_by: params.approvedBy,
  };

  const { data: updatedPending, error: errPending } = await admin
    .from("cleaner_payouts")
    .update(patch)
    .eq("id", params.payoutId)
    .eq("status", "pending")
    .select("id");

  if (errPending) return { ok: false, error: errPending.message };

  let updated = updatedPending;
  if (!updated?.length) {
    const { data: updatedFrozen, error: errFrozen } = await admin
      .from("cleaner_payouts")
      .update(patch)
      .eq("id", params.payoutId)
      .eq("status", "frozen")
      .is("payout_run_id", null)
      .select("id");
    if (errFrozen) return { ok: false, error: errFrozen.message };
    updated = updatedFrozen;
  }

  if (!updated?.length) return { ok: false, error: "Payout is not pending or was already updated." };

  void logSystemEvent({
    level: "info",
    source: "PAYOUT_APPROVED",
    message: "Cleaner payout batch approved",
    context: {
      payoutId: params.payoutId,
      approvedBy: params.approvedBy,
      fundedCents: funding.summary.fundedCents,
      liabilityCents: funding.summary.liabilityCents,
    },
  });

  void logPayoutAuditEvent(admin, {
    eventType: "payout_approved",
    actorUserId: params.approvedBy,
    payoutId: params.payoutId,
    newValues: { status: "approved", funding_gap_cents: 0 },
  });

  return { ok: true };
}
