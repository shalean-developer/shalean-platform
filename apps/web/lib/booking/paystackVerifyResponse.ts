/**
 * POST /api/paystack/verify
 *
 * `success: true` — Paystack reports payment success. `bookingInDatabase` is true when a `bookings` row
 * exists (inserted now or already present). If the row could not be saved, `bookingInDatabase` is false
 * and the customer may receive a **processing** email only (never a confirmed-booking template). Only `reference` is trusted from the client.
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
  /** `paid` | `payment_mismatch` | `payment_reconciliation_required` — Paystack success path only. */
  state?: string;
  /** True when row already existed (idempotent; no duplicate insert). */
  alreadyExists: boolean;
  /** True when upsert was a no-op because another worker or prior verify already persisted this reference. */
  skipped?: boolean;
  upsertError: string | null;
  /** Populated when `bookingInDatabase` and row was loaded (checkout assignment audit). */
  assignmentType?: string | null;
  fallbackReason?: string | null;
  /** True when another cleaner was assigned because checkout choice could not be honored. */
  showCleanerSubstitutionNotice?: boolean;
  /** DB `bookings.attempted_cleaner_id` — customer’s checkout intent when substitution applies. */
  attemptedCleanerId?: string | null;
  /** DB `bookings.cleaner_id` after upsert/dispatch. */
  assignedCleanerId?: string | null;
  /** DB `bookings.selected_cleaner_id` (set when user_selected). */
  selectedCleanerId?: string | null;
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
