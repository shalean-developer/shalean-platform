import type { TemplateChannel } from "@/lib/templates/types";

/** Expected (key, channel) pairs after full catalog migration — used for docs/tests. */
export const NOTIFICATION_TEMPLATE_CATALOG: ReadonlyArray<{
  key: string;
  channel: TemplateChannel;
  /** When true, send path calls getTemplate() today. */
  wiredAtRuntime: boolean;
}> = [
  { key: "booking_confirmed", channel: "email", wiredAtRuntime: true },
  { key: "booking_confirmed", channel: "sms", wiredAtRuntime: true },
  { key: "booking_confirmed", channel: "whatsapp", wiredAtRuntime: false },
  { key: "payment_request", channel: "sms", wiredAtRuntime: true },
  { key: "payment_request", channel: "whatsapp", wiredAtRuntime: false },
  { key: "payment_confirmed", channel: "whatsapp", wiredAtRuntime: false },
  { key: "booking_payment_processing", channel: "email", wiredAtRuntime: true },
  { key: "booking_payment_processing", channel: "sms", wiredAtRuntime: false },
  { key: "payment_link", channel: "email", wiredAtRuntime: true },
  { key: "payment_link", channel: "sms", wiredAtRuntime: false },
  { key: "booking_recovery_saved_quote", channel: "email", wiredAtRuntime: true },
  { key: "booking_assigned", channel: "email", wiredAtRuntime: true },
  { key: "booking_assigned", channel: "whatsapp", wiredAtRuntime: false },
  { key: "customer_booking_assigned", channel: "whatsapp", wiredAtRuntime: false },
  { key: "job_completed", channel: "email", wiredAtRuntime: true },
  { key: "job_completed", channel: "whatsapp", wiredAtRuntime: false },
  { key: "booking_cancelled", channel: "email", wiredAtRuntime: true },
  { key: "booking_cancelled", channel: "sms", wiredAtRuntime: false },
  { key: "booking_cancelled", channel: "whatsapp", wiredAtRuntime: false },
  { key: "booking_rescheduled", channel: "email", wiredAtRuntime: true },
  { key: "booking_rescheduled", channel: "sms", wiredAtRuntime: false },
  { key: "booking_rescheduled", channel: "whatsapp", wiredAtRuntime: false },
  { key: "reminder_2h", channel: "email", wiredAtRuntime: true },
  { key: "reminder_2h", channel: "sms", wiredAtRuntime: false },
  { key: "booking_reminder_24h", channel: "email", wiredAtRuntime: true },
  { key: "booking_reminder_24h", channel: "whatsapp", wiredAtRuntime: false },
  { key: "review_prompt", channel: "email", wiredAtRuntime: true },
  { key: "review_prompt", channel: "whatsapp", wiredAtRuntime: false },
  { key: "review_prompt_sms", channel: "sms", wiredAtRuntime: false },
  { key: "review_prompt_sms_reminder", channel: "sms", wiredAtRuntime: false },
  { key: "dispatch_offer_link", channel: "sms", wiredAtRuntime: false },
  { key: "cleaner_assignment_sms_direct", channel: "sms", wiredAtRuntime: false },
  { key: "cleaner_reminder_2h_sms_direct", channel: "sms", wiredAtRuntime: false },
  { key: "cleaner_dispatch_offer_lost_race_sms", channel: "sms", wiredAtRuntime: false },
  { key: "cleaner_booking_paid_off_platform", channel: "sms", wiredAtRuntime: false },
  { key: "booking_offer", channel: "whatsapp", wiredAtRuntime: false },
  { key: "reminder", channel: "whatsapp", wiredAtRuntime: false },
  { key: "offer_ack", channel: "whatsapp", wiredAtRuntime: false },
  { key: "cleaner_welcome", channel: "whatsapp", wiredAtRuntime: false },
  { key: "cleaner_approved", channel: "whatsapp", wiredAtRuntime: false },
  { key: "cleaner_booking_changed", channel: "whatsapp", wiredAtRuntime: false },
  { key: "cleaner_booking_cancelled", channel: "whatsapp", wiredAtRuntime: false },
  { key: "escalation", channel: "whatsapp", wiredAtRuntime: false },
  { key: "admin_payment_confirmed", channel: "email", wiredAtRuntime: true },
] as const;

export const NOTIFICATION_TEMPLATE_CATALOG_COUNT = NOTIFICATION_TEMPLATE_CATALOG.length;

export const RUNTIME_WIRED_TEMPLATE_COUNT = NOTIFICATION_TEMPLATE_CATALOG.filter((t) => t.wiredAtRuntime).length;
