/**
 * Princess PR D — approved refund amount rules (deterministic).
 *
 * Business rules requiring explicit product approval are marked APPROVAL_REQUIRED
 * in docs/audits/uat/princess/13-prd-refund-reconciliation.md.
 */

export type RefundAmountDecision =
  | {
      ok: true;
      requestedCents: number;
      refundableCents: number;
      capturedCents: number;
      priorRefundedCents: number;
      kind: "full" | "partial";
    }
  | {
      ok: false;
      error:
        | "nothing_to_refund"
        | "invalid_amount"
        | "amount_exceeds_refundable"
        | "currency_mismatch"
        | "already_fully_refunded";
    };

export function resolveCapturedCents(row: {
  amount_paid_cents?: number | null;
  total_paid_cents?: number | null;
  total_paid_zar?: number | null;
  /** Immutable original capture when remaining paid columns were reduced by partials. */
  original_captured_cents?: number | null;
}): number {
  const original = Number(row.original_captured_cents);
  if (Number.isFinite(original) && original > 0) return Math.round(original);
  const ap = Number(row.amount_paid_cents ?? row.total_paid_cents);
  if (Number.isFinite(ap) && ap > 0) return Math.round(ap);
  const zar = Number(row.total_paid_zar);
  if (Number.isFinite(zar) && zar > 0) return Math.round(zar * 100);
  return 0;
}

/**
 * Maximum still refundable = captured − prior successful refunds.
 * Service fee / discount / extras are NOT separated: refund base is net captured cash.
 */
export function computeRefundableCents(params: {
  capturedCents: number;
  priorRefundedCents: number;
}): number {
  const captured = Math.max(0, Math.round(params.capturedCents));
  const prior = Math.max(0, Math.round(params.priorRefundedCents));
  return Math.max(0, captured - prior);
}

export function decideRefundAmount(params: {
  capturedCents: number;
  priorRefundedCents: number;
  /** Omit / null → full remaining refundable. */
  requestedCents?: number | null;
  currency?: string | null;
  expectedCurrency?: string;
}): RefundAmountDecision {
  const expected = (params.expectedCurrency ?? "ZAR").toUpperCase();
  if (params.currency != null && String(params.currency).trim()) {
    if (String(params.currency).trim().toUpperCase() !== expected) {
      return { ok: false, error: "currency_mismatch" };
    }
  }

  const capturedCents = Math.max(0, Math.round(params.capturedCents));
  const priorRefundedCents = Math.max(0, Math.round(params.priorRefundedCents));
  const refundableCents = computeRefundableCents({ capturedCents, priorRefundedCents });

  if (capturedCents <= 0) return { ok: false, error: "nothing_to_refund" };
  if (refundableCents <= 0) return { ok: false, error: "already_fully_refunded" };

  const requested =
    params.requestedCents != null && Number.isFinite(params.requestedCents)
      ? Math.round(params.requestedCents)
      : refundableCents;

  if (requested <= 0) return { ok: false, error: "invalid_amount" };
  if (requested > refundableCents) return { ok: false, error: "amount_exceeds_refundable" };

  return {
    ok: true,
    requestedCents: requested,
    refundableCents,
    capturedCents,
    priorRefundedCents,
    kind: requested >= refundableCents ? "full" : "partial",
  };
}

/** Mask Paystack / gateway references for logs and customer-safe surfaces. */
export function maskPaymentReference(reference: string | null | undefined): string | null {
  const ref = String(reference ?? "").trim();
  if (!ref) return null;
  if (ref.length <= 8) return `${ref.slice(0, 2)}…`;
  return `${ref.slice(0, 4)}…${ref.slice(-4)}`;
}
