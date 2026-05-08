import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";

export type BookingPaymentBlockedReason =
  | { kind: "admin_unavailable" }
  | { kind: "not_found" }
  | { kind: "wrong_status"; paid: boolean; bookingId: string }
  | { kind: "missing_email" }
  | { kind: "invalid_amount" };

export type BookingPaymentServerState =
  | { status: "ready"; summary: BookingPaymentSummary }
  | { status: "blocked"; reason: BookingPaymentBlockedReason };

/** Props from `/booking/payment` server component — always backed by a booking row. */
export type BookingPaymentPagePayload = BookingPaymentServerState;
