/**
 * Declarative channel fallback policy (Stripe-style).
 *
 * Implemented in code today (`communicationPolicy.ts`):
 * - **SMS:** disabled globally unless `SMS_OUTBOUND_ENABLED=true`. When enabled, **cleaners only** (no admin/customer SMS).
 * - **Email:** **admin and customers only** — cleaner profile emails are synthetic auth addresses and must not receive mail.
 * - **Customer** `payment_confirmed`: email first; SMS paths remain in code but are blocked by policy; no customer WhatsApp.
 * - **Cleaner** `assigned` / `reminder_2h` / dispatch: SMS when re-enabled; WhatsApp where configured.
 *
 * Future: mirror rows in a `notification_rules` table (event_type, primary_channel, fallback_channel) and hydrate here.
 */
export type NotificationChannel = "email" | "whatsapp" | "sms";

export type ChannelFallbackRule = {
  event_type: string;
  role: "customer" | "cleaner" | "admin";
  primary_channel: NotificationChannel;
  fallback_channel: NotificationChannel;
};
