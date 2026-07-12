/**
 * Public Paystack key only (`pk_…`). Safe to return to clients so Inline checkout
 * matches the secret used by `/api/paystack/verify`.
 */
export function getPaystackPublicKey(): string {
  return (process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY ?? "").trim();
}
