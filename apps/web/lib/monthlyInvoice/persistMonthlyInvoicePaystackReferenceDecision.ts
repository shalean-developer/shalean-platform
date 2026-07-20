/**
 * Pure decision helper for BILL-INV-002 Phase A Paystack ref persistence.
 * Exported for unit tests — keep in sync with persistMonthlyInvoicePaystackReferenceBeforeInit.
 */
export type PersistMonthlyInvoicePaystackRefDecision =
  | { action: "noop" }
  | { action: "conflict_active_link" }
  | { action: "conflict_status"; status: string }
  | { action: "rotate_cleared_link"; statuses: readonly string[] }
  | { action: "claim_null_draft" }
  | { action: "set_open_status"; statuses: readonly string[] }
  | { action: "unsupported" };

const PAYABLE = ["draft", "sent", "partially_paid", "overdue"] as const;

export function decidePersistMonthlyInvoicePaystackReference(params: {
  status: string | null;
  existingReference: string | null;
  nextReference: string;
  paymentLink: string | null;
}): PersistMonthlyInvoicePaystackRefDecision {
  const statusNorm = String(params.status ?? "").toLowerCase();
  const pref = String(params.existingReference ?? "").trim();
  const link = String(params.paymentLink ?? "").trim();
  const reference = params.nextReference.trim();

  if (pref === reference) return { action: "noop" };

  if (pref && pref !== reference) {
    if (link) return { action: "conflict_active_link" };
    if (!PAYABLE.includes(statusNorm as (typeof PAYABLE)[number])) {
      return { action: "conflict_status", status: statusNorm };
    }
    return { action: "rotate_cleared_link", statuses: PAYABLE };
  }

  if (statusNorm === "draft") return { action: "claim_null_draft" };
  if (statusNorm === "sent" || statusNorm === "partially_paid" || statusNorm === "overdue") {
    return { action: "set_open_status", statuses: ["sent", "partially_paid", "overdue"] };
  }
  return { action: "unsupported" };
}
