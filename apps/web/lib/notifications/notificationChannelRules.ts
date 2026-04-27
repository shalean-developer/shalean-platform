/**
 * Declarative channel fallback policy (Stripe-style).
 *
 * Implemented in code today:
 * - **Cleaner** `assigned` / `reminder_2h`: WhatsApp first; on failure → `sendSmsFallback` (`notifyBookingEvent.ts`).
 * - **Customer** `payment_confirmed`: email + optional SMS; **no customer WhatsApp** (policy: Meta WA → cleaners only).
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
