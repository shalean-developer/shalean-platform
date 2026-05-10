/**
 * Phase 15A Week 3 — rule-based anomaly classification (read-only, advisory).
 * Used by `phase15aAnomaliesReadModel` and tests. Not enforcement.
 */

import { bookingPaymentRecomputeBlockedByRefund, type BookingPaidSignalRow } from "@/lib/payout/bookingEarningsIntegrity";
import type { Phase15aAnomalyCategorySlug, Phase15aClassification } from "@/lib/payout/phase15aAnomaliesShared";

export type Phase15aClassificationContext = {
  category_slug: Phase15aAnomalyCategorySlug;
  booking_id: string | null;
  cleaner_id: string | null;
  payout_status: string | null;
  payment_status: string | null;
  reason: string | null;
  cleaner_earnings_status: string | null;
  booking_completed_at?: string | null;
  booking_status?: string | null;
  refunded_at?: string | null;
  refund_status?: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function normLower(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase();
}

const LEGACY_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function isLegacyCompletedAt(completedAt: string | null | undefined): boolean {
  if (!completedAt) return false;
  const t = Date.parse(completedAt);
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > LEGACY_AGE_MS;
}

export function classifyPhase15aAnomaly(
  ctx: Phase15aClassificationContext,
): { classification: Phase15aClassification; classification_reason: string } {
  const bid = String(ctx.booking_id ?? "").trim();
  const cid = String(ctx.cleaner_id ?? "").trim();
  if (!UUID_RE.test(bid) || !UUID_RE.test(cid)) {
    return {
      classification: "missing_relation_candidate",
      classification_reason: "missing_or_invalid_booking_id_or_cleaner_id",
    };
  }

  const refundRow: BookingPaidSignalRow = {
    refunded_at: ctx.refunded_at,
    refund_status: ctx.refund_status,
  };
  if (bookingPaymentRecomputeBlockedByRefund(refundRow)) {
    return {
      classification: "refund_related_candidate",
      classification_reason: "booking_has_refund_or_reversal_signals",
    };
  }

  const ps = normLower(ctx.payout_status);
  const cat = ctx.category_slug;

  if ((cat === "batch_authority" || cat === "transfer_authority") && ps === "eligible") {
    return {
      classification: "terminology_mismatch_candidate",
      classification_reason:
        "weekly_batch_or_transfer_succeeded_but_booking_payout_status_still_eligible_rail_vocabulary_lag",
    };
  }

  if (cat === "authority_ahead" && ps === "paid") {
    return {
      classification: "terminology_mismatch_candidate",
      classification_reason: "booking_payout_column_paid_but_cleaner_earnings_not_in_active_pipeline",
    };
  }

  if (cat === "ledger_ahead") {
    return {
      classification: "active_blocker_candidate",
      classification_reason: "ledger_processing_or_paid_before_booking_payout_eligible_or_paid",
    };
  }

  if (cat === "claim_shadow") {
    return {
      classification: "active_blocker_candidate",
      classification_reason: "claimable_ledger_shape_fails_booking_weekly_authority_predicate",
    };
  }

  if (cat === "batched_claimable") {
    if (isLegacyCompletedAt(ctx.booking_completed_at)) {
      return {
        classification: "legacy_drift_candidate",
        classification_reason: "stale_weekly_batch_link_with_claim_shaped_ledger_on_old_completed_job",
      };
    }
    return {
      classification: "active_blocker_candidate",
      classification_reason: "payout_id_set_but_ledger_still_approved_without_disbursement",
    };
  }

  if ((cat === "batch_authority" || cat === "transfer_authority") && isLegacyCompletedAt(ctx.booking_completed_at)) {
    return {
      classification: "legacy_drift_candidate",
      classification_reason: "weekly_settlement_succeeded_but_authority_mismatch_on_old_completed_job",
    };
  }

  if (cat === "authority_ahead") {
    return {
      classification: "needs_manual_review",
      classification_reason: "eligible_or_paid_authority_with_off_rail_ledger_non_paid_terminology_branch",
    };
  }

  if (cat === "batch_authority" || cat === "transfer_authority") {
    return {
      classification: "needs_manual_review",
      classification_reason: "weekly_settled_but_booking_fails_phase12_predicate_review_context",
    };
  }

  return {
    classification: "needs_manual_review",
    classification_reason: "unclassified_anomaly_pattern",
  };
}

export function buildPhase15aClassificationContext(
  category_slug: Phase15aAnomalyCategorySlug,
  row: {
    booking_id: string | null;
    cleaner_id: string | null;
    payout_status: string | null;
    payment_status: string | null;
    reason: string | null;
    cleaner_earnings_status: string | null;
  },
  booking?: Record<string, unknown> | null,
): Phase15aClassificationContext {
  return {
    category_slug,
    booking_id: row.booking_id,
    cleaner_id: row.cleaner_id,
    payout_status: row.payout_status,
    payment_status: row.payment_status,
    reason: row.reason,
    cleaner_earnings_status: row.cleaner_earnings_status,
    booking_completed_at: (booking?.completed_at as string | null | undefined) ?? null,
    booking_status: (booking?.status as string | null | undefined) ?? null,
    refunded_at: (booking?.refunded_at as string | null | undefined) ?? null,
    refund_status: (booking?.refund_status as string | null | undefined) ?? null,
  };
}
