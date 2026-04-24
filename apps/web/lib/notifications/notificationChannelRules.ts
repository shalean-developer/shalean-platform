/**
 * Declarative channel fallback policy (Stripe-style).
 *
 * Implemented in code today:
 * - **Cleaner** `assigned` / `reminder_2h`: WhatsApp first; on failure → `sendSmsFallback` (`notifyBookingEvent.ts`).
 * - **Customer** `payment_confirmed`: WhatsApp first; on failure → SMS template (`notifyBookingEvent.ts` + `customerOutbound.ts`).
 *
 * Future: mirror rows in a `notification_rules` table (event_type, primary_channel, fallback_channel) and hydrate here.
 *
 * Regional primary channel for **customer payment_confirmed** phone sends lives in
 * `notificationRegionPolicy.ts` (`WHATSAPP_FIRST_COUNTRY_CODES`, `DEFAULT_NOTIFICATION_BUSINESS_COUNTRY`).
 */
export type NotificationChannel = "email" | "whatsapp" | "sms";

export type ChannelFallbackRule = {
  event_type: string;
  role: "customer" | "cleaner" | "admin";
  primary_channel: NotificationChannel;
  fallback_channel: NotificationChannel;
};
