export type PaystackReturnSearchParams = {
  ref?: string;
  reference?: string;
  trxref?: string;
};

export type PaystackReturnClassification =
  | { kind: "callback"; reference: string }
  | { kind: "payment_link"; reference: string }
  | { kind: "missing"; reference: "" };

/**
 * Paystack gateway returns use `reference` / `trxref`.
 * Shalean-generated unpaid links use `ref`.
 * Gateway returns must enter verification and must never initialize another charge.
 */
export function classifyPaystackReturn(
  params: PaystackReturnSearchParams,
): PaystackReturnClassification {
  const callbackReference = params.reference?.trim() || params.trxref?.trim() || "";
  if (callbackReference) return { kind: "callback", reference: callbackReference };

  const paymentLinkReference = params.ref?.trim() || "";
  if (paymentLinkReference) return { kind: "payment_link", reference: paymentLinkReference };

  return { kind: "missing", reference: "" };
}
