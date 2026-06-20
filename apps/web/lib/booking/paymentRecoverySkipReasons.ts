/** Machine-readable skip / cancel reasons for payment recovery jobs. */
export const PAYMENT_RECOVERY_SKIP = {
  bookingCancelled: "booking_cancelled",
  bookingPaid: "booking_paid",
  bookingAlreadyExpired: "booking_already_expired",
  paystackPaymentSucceeded: "paystack_payment_succeeded",
  invalidEmail: "invalid_email",
  bookingNotFound: "booking_not_found",
  paymentCancelledOnSuccess: "payment_succeeded",
} as const;

export type PaymentRecoverySkipReason = (typeof PAYMENT_RECOVERY_SKIP)[keyof typeof PAYMENT_RECOVERY_SKIP];

export type PaymentRecoveryJobType = "payment_reminder_1h" | "payment_reminder_24h" | "booking_payment_expired";

export const PAYMENT_RECOVERY_JOB_TYPES: PaymentRecoveryJobType[] = [
  "payment_reminder_1h",
  "payment_reminder_24h",
  "booking_payment_expired",
];

const HOUR_MS = 60 * 60 * 1000;

/** Schedule offsets from booking `created_at` for each recovery job type. */
export const PAYMENT_RECOVERY_SCHEDULE_OFFSET_MS: Record<PaymentRecoveryJobType, number> = {
  payment_reminder_1h: 1 * HOUR_MS,
  payment_reminder_24h: 24 * HOUR_MS,
  booking_payment_expired: 48 * HOUR_MS,
};
