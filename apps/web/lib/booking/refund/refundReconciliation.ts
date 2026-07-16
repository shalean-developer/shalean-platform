/**
 * Deterministic refund ↔ capture ↔ ledger reconciliation assertions.
 */

export type RefundLedgerLine = {
  kind: "capture" | "refund";
  amountCents: number;
  currency: string;
  gatewayReference: string;
};

export type RefundReconciliationInput = {
  capturedCents: number;
  refundedCents: number;
  currency: string;
  ledgerLines: RefundLedgerLine[];
};

export type RefundReconciliationResult =
  | { ok: true; netCents: number; refundLineCount: number }
  | {
      ok: false;
      error:
        | "over_refund"
        | "currency_inconsistent"
        | "duplicate_refund_reference"
        | "ledger_refund_sum_mismatch"
        | "negative_capture"
        | "capture_missing";
    };

export function assertRefundReconciliation(
  input: RefundReconciliationInput,
): RefundReconciliationResult {
  const captured = Math.round(input.capturedCents);
  const refunded = Math.round(input.refundedCents);
  if (captured < 0) return { ok: false, error: "negative_capture" };
  if (captured <= 0 && refunded > 0) return { ok: false, error: "capture_missing" };
  if (refunded > captured) return { ok: false, error: "over_refund" };

  const expectedCurrency = String(input.currency || "ZAR").toUpperCase();
  for (const line of input.ledgerLines) {
    if (String(line.currency || "").toUpperCase() !== expectedCurrency) {
      return { ok: false, error: "currency_inconsistent" };
    }
  }

  const refs = new Set<string>();
  for (const line of input.ledgerLines) {
    const ref = line.gatewayReference.trim();
    if (!ref) continue;
    if (refs.has(ref)) return { ok: false, error: "duplicate_refund_reference" };
    refs.add(ref);
  }

  const refundSum = input.ledgerLines
    .filter((l) => l.kind === "refund")
    .reduce((sum, l) => sum + Math.max(0, Math.round(l.amountCents)), 0);

  if (refundSum !== refunded) {
    return { ok: false, error: "ledger_refund_sum_mismatch" };
  }

  return {
    ok: true,
    netCents: captured - refunded,
    refundLineCount: input.ledgerLines.filter((l) => l.kind === "refund").length,
  };
}

/** Gateway reference for a booking refund ledger row — unique per refund id. */
export function refundGatewayReference(params: {
  chargeReference: string;
  refundId: string;
}): string {
  const charge = params.chargeReference.trim() || "unknown";
  const id = params.refundId.trim();
  return `refund:${charge}:${id}`.slice(0, 200);
}
