export type PaymentFinalizePhase =
  | "finalizing"
  | "success"
  | "persist_pending"
  | "needs_retry"
  | "failed"
  | "cancelled";

export type PaystackVerifySuccessBody = {
  success: true;
  paymentStatus: "success";
  reference?: string;
  bookingInDatabase?: boolean;
  bookingId?: string | null;
  bookingReference?: string | null;
  amountCents?: number;
  currency?: string;
  upsertError?: string | null;
  error?: string;
};

export type PaystackVerifyFailureBody = {
  success: false;
  paymentStatus?: "failed" | "pending" | "unknown" | "success";
  reference?: string;
  error?: string;
};

export type PaystackVerifyResponse = PaystackVerifySuccessBody | PaystackVerifyFailureBody;

export type PaystackStatusResponse = {
  bookingId?: string | null;
  status?: string;
  error?: string;
};

export type PaymentFinalizeResult = {
  phase: Exclude<PaymentFinalizePhase, "finalizing" | "cancelled">;
  bookingId: string | null;
  bookingReference: string | null;
  errorMessage: string | null;
  paymentStatus: "success" | "failed" | "pending" | "unknown" | null;
};

export type PaystackInlineParams = {
  publicKey: string;
  email: string;
  amountZar: number;
  reference: string;
  bookingId: string;
};

export type PaystackWebViewMessage =
  | { type: "success"; reference: string }
  | { type: "cancel" }
  | { type: "error"; message?: string };
