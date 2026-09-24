export const PAYMENT_EDIT_SUPERSEDED_REASON = "customer_edit_after_checkout" as const;

export type PaymentEditSupersedeMarker = {
  reason: typeof PAYMENT_EDIT_SUPERSEDED_REASON;
  superseded_at: string;
  paystack_reference: string | null;
  cleanup_done_at: string | null;
};

function snapshotRecord(snapshot: unknown): Record<string, unknown> {
  return snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    ? { ...(snapshot as Record<string, unknown>) }
    : {};
}

export function readPaymentEditSupersedeMarker(
  snapshot: unknown,
): PaymentEditSupersedeMarker | null {
  const record = snapshotRecord(snapshot);
  const raw = record.payment_edit_superseded;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const marker = raw as Record<string, unknown>;
  if (marker.reason !== PAYMENT_EDIT_SUPERSEDED_REASON) return null;

  const supersededAt =
    typeof marker.superseded_at === "string" ? marker.superseded_at.trim() : "";
  if (!supersededAt) return null;

  return {
    reason: PAYMENT_EDIT_SUPERSEDED_REASON,
    superseded_at: supersededAt,
    paystack_reference:
      typeof marker.paystack_reference === "string" && marker.paystack_reference.trim()
        ? marker.paystack_reference.trim()
        : null,
    cleanup_done_at:
      typeof marker.cleanup_done_at === "string" && marker.cleanup_done_at.trim()
        ? marker.cleanup_done_at.trim()
        : null,
  };
}

export function isPaymentEditSupersededSnapshot(snapshot: unknown): boolean {
  return readPaymentEditSupersedeMarker(snapshot) != null;
}

export function withPaymentEditSupersedeMarker(
  snapshot: unknown,
  input: {
    supersededAt: string;
    paystackReference: string | null;
    cleanupDoneAt?: string | null;
  },
): Record<string, unknown> {
  const next = snapshotRecord(snapshot);
  next.payment_edit_superseded = {
    reason: PAYMENT_EDIT_SUPERSEDED_REASON,
    superseded_at: input.supersededAt,
    paystack_reference: input.paystackReference?.trim() || null,
    cleanup_done_at: input.cleanupDoneAt?.trim() || null,
  } satisfies PaymentEditSupersedeMarker;
  return next;
}

export function markPaymentEditSupersedeCleanupDone(
  snapshot: unknown,
  cleanupDoneAt: string,
): Record<string, unknown> {
  const existing = readPaymentEditSupersedeMarker(snapshot);
  if (!existing) return snapshotRecord(snapshot);
  return withPaymentEditSupersedeMarker(snapshot, {
    supersededAt: existing.superseded_at,
    paystackReference: existing.paystack_reference,
    cleanupDoneAt,
  });
}
