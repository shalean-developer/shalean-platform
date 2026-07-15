/**
 * Shared payment amount mismatch tolerance (Phase 1 revenue integrity).
 * Hard quarantine, metrics, and verify paths must agree on this epsilon.
 */
export const PAYMENT_AMOUNT_MISMATCH_EPS_ZAR = 1;
export const PAYMENT_AMOUNT_MISMATCH_EPS_CENTS = PAYMENT_AMOUNT_MISMATCH_EPS_ZAR * 100;

/** Checkout / Paystack prepaid path accepts ZAR only. */
export const CHECKOUT_CURRENCY_ZAR = "ZAR";

/** True when |paid − expected| exceeds the production hard gate (1 ZAR). */
export function isPaymentAmountMismatchZar(paidZar: number, expectedZar: number): boolean {
  if (!Number.isFinite(paidZar) || !Number.isFinite(expectedZar)) return true;
  return Math.abs(paidZar - expectedZar) > PAYMENT_AMOUNT_MISMATCH_EPS_ZAR;
}

/** Cents variant for Paystack amount vs booking payable total. */
export function isPaymentAmountMismatchCents(paidCents: number, expectedCents: number): boolean {
  if (!Number.isFinite(paidCents) || !Number.isFinite(expectedCents)) return true;
  return Math.abs(paidCents - expectedCents) > PAYMENT_AMOUNT_MISMATCH_EPS_CENTS;
}

/** True when the gateway currency is exactly ZAR (case-insensitive). */
export function isCheckoutCurrencyZar(currency: string | null | undefined): boolean {
  return String(currency ?? "").trim().toUpperCase() === CHECKOUT_CURRENCY_ZAR;
}

/** Mask Paystack references for structured logs (never full card or secret payloads). */
export function maskPaystackReference(reference: string | null | undefined): string | null {
  const t = String(reference ?? "").trim();
  if (!t) return null;
  if (t.length <= 10) return `${t.slice(0, 3)}…`;
  return `${t.slice(0, 10)}…`;
}
