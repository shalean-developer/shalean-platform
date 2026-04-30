/** Paystack REST origin, without trailing slash. */
export function getPaystackBaseUrl(): string {
  const raw = process.env.PAYSTACK_BASE_URL?.trim() || "https://api.paystack.co";
  return raw.replace(/\/+$/, "");
}
