/**
 * Declarative channel policy.
 *
 * Current production direction:
 * - **WhatsApp:** primary phone notification channel for customers and cleaners when an approved template exists.
 * - **SMS:** globally disabled by `communicationPolicy.ts`; there is no automatic SMS fallback.
 * - **Email:** retained for customers/admin where existing flows already depend on it.
 * - **Cleaner email:** disabled because cleaner profile emails are synthetic auth addresses.
 *
 * Templates that are not Meta-approved remain fail-closed. Do not fall back to SMS
 * simply because a WhatsApp template is pending/rejected; surface the delivery gap
 * in notification monitoring instead.
 */
export type NotificationChannel = "email" | "whatsapp" | "sms";

export type ChannelFallbackRule = {
  event_type: string;
  role: "customer" | "cleaner" | "admin";
  primary_channel: NotificationChannel;
  fallback_channel: NotificationChannel;
};
