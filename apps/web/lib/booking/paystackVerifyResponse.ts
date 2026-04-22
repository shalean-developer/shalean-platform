/**
 * POST /api/paystack/verify
 *
 * `success: true` — Paystack reports payment success. `bookingInDatabase` is true when a `bookings` row
 * exists (inserted now or already present). If the row could not be saved, `bookingInDatabase` is false
 * but confirmation email may still have been sent (failsafe). Only `reference` is trusted from the client.
 */
export type PaystackVerifyPostSuccess = {
  success: true;
  /** @deprecated use `success` */
  ok: true;
  paymentStatus: "success";
  reference: string;
  amountCents: number;
  currency: string;
  customerEmail: string;
  customerName: string | null;
  userId: string | null;
  bookingSnapshot: unknown;
  bookingInDatabase: boolean;
  bookingId: string | null;
  /** True when row already existed (idempotent; no duplicate insert). */
  alreadyExists: boolean;
  upsertError: string | null;
};

export type PaystackVerifyPostFailure = {
  success: false;
  /** @deprecated use `success` */
  ok: false;
  paymentStatus: "failed" | "pending" | "unknown" | "success";
  reference?: string;
  error?: string;
};

export type PaystackVerifyPostResponse = PaystackVerifyPostSuccess | PaystackVerifyPostFailure;
