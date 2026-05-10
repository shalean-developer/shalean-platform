/**
 * Phase 15A — shared types and UI copy (client + server safe; no `server-only`).
 * Read queries live in `phase15aAnomaliesReadModel.ts`; classification rules in `phase15aAnomalyClassification.ts`.
 */

export type Phase15aAnomalyCategorySlug =
  | "ledger_ahead"
  | "authority_ahead"
  | "batched_claimable"
  | "claim_shadow"
  | "batch_authority"
  | "transfer_authority";

export const PHASE15A_ANOMALY_CATEGORY_SLUGS: Phase15aAnomalyCategorySlug[] = [
  "ledger_ahead",
  "authority_ahead",
  "batched_claimable",
  "claim_shadow",
  "batch_authority",
  "transfer_authority",
];

export function parsePhase15aCategoryParam(raw: string | null): Phase15aAnomalyCategorySlug | null {
  const s = String(raw ?? "").trim() as Phase15aAnomalyCategorySlug;
  return PHASE15A_ANOMALY_CATEGORY_SLUGS.includes(s) ? s : null;
}

/** Week 3 — advisory labels only; not enforcement (Phase 15B/C). */
export type Phase15aClassification =
  | "active_blocker_candidate"
  | "legacy_drift_candidate"
  | "refund_related_candidate"
  | "terminology_mismatch_candidate"
  | "missing_relation_candidate"
  | "needs_manual_review";

export const PHASE15A_CLASSIFICATIONS: Phase15aClassification[] = [
  "active_blocker_candidate",
  "legacy_drift_candidate",
  "refund_related_candidate",
  "terminology_mismatch_candidate",
  "missing_relation_candidate",
  "needs_manual_review",
];

/** Default / max scan window for Phase 15A diagnostics and burn-in alignment (API clamp matches this). */
export const PHASE15A_ANOMALIES_DEFAULT_MAX_SCAN = 5000;

export function parsePhase15aClassificationParam(raw: string | null): Phase15aClassification | null {
  const s = String(raw ?? "").trim() as Phase15aClassification;
  return PHASE15A_CLASSIFICATIONS.includes(s) ? s : null;
}

export type Phase15aAnomalyRow = {
  category_slug: Phase15aAnomalyCategorySlug;
  category_label: string;
  booking_id: string | null;
  cleaner_id: string | null;
  cleaner_earning_id: string | null;
  payout_id: string | null;
  cleaner_payout_id: string | null;
  payout_transfer_id: string | null;
  disbursement_id: string | null;
  payment_status: string | null;
  payment_state: string | null;
  payout_status: string | null;
  cleaner_earnings_status: string | null;
  reason: string | null;
  classification: Phase15aClassification;
  classification_reason: string;
};

export type Phase15aBurnInReadiness = {
  has_active_blocker_candidates: boolean;
  has_refund_related_candidates: boolean;
  has_missing_relation_candidates: boolean;
  counts_lower_bound_due_to_scan_cap: boolean;
  /** Categories with at least one anomaly in the current scan (investigate before Phase 15B soft gates). */
  categories_suggested_for_phase15b_investigation: Phase15aAnomalyCategorySlug[];
  advisory_note: string;
};

export type Phase15bPreGateReadiness = {
  status: "not_ready" | "caution" | "review_ok";
  rationale: string;
};

export type Phase15aAnomaliesReadModel = {
  measurement_only: true;
  disclaimer: string;
  limit: number;
  max_scan: number;
  total_anomaly_count: number;
  counts_by_category: Record<Phase15aAnomalyCategorySlug, number>;
  count_lower_bound_by_category: Record<Phase15aAnomalyCategorySlug, boolean>;
  rows_by_category: Record<Phase15aAnomalyCategorySlug, Phase15aAnomalyRow[]>;
  /** Week 3 — classification is advisory; does not block payouts. */
  classification_advisory_note: string;
  counts_by_classification: Record<Phase15aClassification, number>;
  counts_by_category_and_classification: Record<Phase15aAnomalyCategorySlug, Record<Phase15aClassification, number>>;
  burn_in_readiness: Phase15aBurnInReadiness;
  phase15b_pre_gate_readiness: Phase15bPreGateReadiness;
  /** When set, row slices and category counts reflect this filter only. */
  classification_filter_applied: Phase15aClassification | null;
};

const DISCLAIMER =
  "Phase 15A measurement only. These findings do not block payouts yet.";

/** Shared admin UI + API copy (keep in sync with diagnostics page). */
export const PHASE15A_UI_COPY = {
  badge: "Measurement only",
  banner: DISCLAIMER,
  specRef:
    "Aligned with `bookingPayableForWeeklyBatch` and SQL probes P8 / P10 / P11 / P11b (`audit_payout_subsystem_convergence_phase11.sql`).",
  /** Week 3 — classification banner (distinct from measurement-only payout disclaimer). */
  classificationAdvisory:
    "Classification is advisory. Phase 15A still does not block payouts.",
} as const;
