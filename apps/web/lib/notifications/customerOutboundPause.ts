import { getNotificationRuntimeFlags } from "@/lib/notifications/notificationRuntimeFlags";

export type CustomerOutboundPauseState = {
  paused: boolean;
  untilIso: string | null;
};

/** True when ops has paused customer email/SMS (Resend/Twilio) outbound. */
export async function isCustomerOutboundPaused(): Promise<CustomerOutboundPauseState> {
  const row = await getNotificationRuntimeFlags();
  const until = row?.customer_outbound_paused_until ?? null;
  if (!until) return { paused: false, untilIso: null };
  const t = Date.parse(until);
  if (!Number.isFinite(t) || t <= Date.now()) return { paused: false, untilIso: until };
  return { paused: true, untilIso: until };
}
