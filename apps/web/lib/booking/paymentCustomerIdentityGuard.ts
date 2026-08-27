export type PaymentCustomerIdentity = {
  customerEmail?: string | null;
  customerAuthId?: string | null;
};

export type PaymentCustomerIdentityMismatch = "email" | "ownership";

function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeId(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Protect an already-persisted pending booking from being silently relinked by
 * stale or inconsistent Paystack snapshot/metadata during payment finalization.
 *
 * Missing identity on either side is not treated as a mismatch: older guest
 * rows may legitimately need ownership filled during finalization. Once an
 * identity is present on the pending row, however, an incoming conflicting
 * value must fail closed.
 */
export function paymentCustomerIdentityMismatch(
  existing: PaymentCustomerIdentity,
  incoming: PaymentCustomerIdentity,
): PaymentCustomerIdentityMismatch | null {
  const existingEmail = normalizeEmail(existing.customerEmail);
  const incomingEmail = normalizeEmail(incoming.customerEmail);
  if (existingEmail && incomingEmail && existingEmail !== incomingEmail) {
    return "email";
  }

  const existingAuthId = normalizeId(existing.customerAuthId);
  const incomingAuthId = normalizeId(incoming.customerAuthId);
  if (existingAuthId && incomingAuthId && existingAuthId !== incomingAuthId) {
    return "ownership";
  }

  return null;
}
