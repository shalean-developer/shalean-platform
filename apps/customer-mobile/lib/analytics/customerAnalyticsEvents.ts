/**
 * Allowed `user_events.event_type` values used by the customer app.
 * Must stay within apps/web USER_EVENT_TYPES_DB — unknown types are rejected by the API.
 */
export const CUSTOMER_ANALYTICS_EVENTS = {
  PAGE_VIEW: "page_view",
  BOOKING_STARTED: "booking_started",
  BOOKING_STEP_DETAILS_STARTED: "booking_step_details_started",
  BOOKING_CONTINUE_SCHEDULE: "booking_continue_schedule",
  BOOKING_PAYMENT_STARTED: "booking_payment_started",
  BOOKING_PAYSTACK_OPENED: "booking_paystack_opened",
  PAYMENT_INITIATED: "payment_initiated",
  PAYMENT_COMPLETED: "payment_completed",
  BOOKING_COMPLETED: "booking_completed",
  BOOKING_CTA_CLICKED: "booking_cta_clicked",
  REVIEW_SUBMITTED: "review_submitted",
  REVIEW_PROMPT_CLICKED: "review_prompt_clicked",
  REFERRAL_CREATED: "referral_created",
} as const;

export type CustomerAnalyticsEvent =
  (typeof CUSTOMER_ANALYTICS_EVENTS)[keyof typeof CUSTOMER_ANALYTICS_EVENTS];

const ALLOWED = new Set<string>(Object.values(CUSTOMER_ANALYTICS_EVENTS));

export function isAllowedCustomerAnalyticsEvent(eventType: string): boolean {
  return ALLOWED.has(eventType);
}

/** Drop PII / oversized values before ingest. */
export function sanitizeAnalyticsPayload(
  payload: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!payload) return {};
  const blocked = new Set([
    "email",
    "phone",
    "password",
    "full_name",
    "fullName",
    "token",
    "access_token",
    "refresh_token",
    "card",
    "cvv",
  ]);
  const out: Record<string, unknown> = {
    client: "customer_mobile",
  };
  let n = 0;
  for (const [k, v] of Object.entries(payload)) {
    if (n >= 40) break;
    if (blocked.has(k) || blocked.has(k.toLowerCase())) continue;
    if (v === null || typeof v === "boolean" || typeof v === "number") {
      out[k] = v;
      n++;
      continue;
    }
    if (typeof v === "string" && v.length <= 200) {
      out[k] = v;
      n++;
    }
  }
  return out;
}
