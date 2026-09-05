import { normalizeEmail } from "@/lib/booking/normalizeEmail";

export type PaymentCustomerIdentity = {
  customerEmail: string | null;
  customerAuthId: string | null;
};

export function preservePaymentCustomerIdentity(
  observed: PaymentCustomerIdentity,
  incoming: PaymentCustomerIdentity,
): { identity: PaymentCustomerIdentity; error: null } | {
  identity: null;
  error: { code: "PAYMENT_CUSTOMER_IDENTITY_MISMATCH"; message: string };
} {
  const email = (value: string | null) => normalizeEmail(value ?? "");
  const owner = (value: string | null) => (value ?? "").trim().toLowerCase();
  const mismatch =
    email(observed.customerEmail) && email(incoming.customerEmail) &&
    email(observed.customerEmail) !== email(incoming.customerEmail) ? "email" :
    owner(observed.customerAuthId) && owner(incoming.customerAuthId) &&
    owner(observed.customerAuthId) !== owner(incoming.customerAuthId) ? "ownership" : null;
  if (mismatch) {
    return { identity: null, error: {
      code: "PAYMENT_CUSTOMER_IDENTITY_MISMATCH",
      message: `Payment customer ${mismatch} does not match the pending booking.`,
    } };
  }
  return { error: null, identity: {
    customerEmail: email(incoming.customerEmail) ? incoming.customerEmail : observed.customerEmail,
    customerAuthId: owner(incoming.customerAuthId) ? incoming.customerAuthId : observed.customerAuthId,
  } };
}
