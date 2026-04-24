/**
 * Normalized outcome for outbound channels (metrics, retries, dashboards).
 * Wire arrays of these from `notifyBookingEvent` (or transports) when you add retry / Datadog rollups.
 */
export type ChannelResult = {
  ok: boolean;
  provider: "whatsapp" | "sms" | "email";
  error?: string;
};

export function channelResult(
  provider: ChannelResult["provider"],
  ok: boolean,
  error?: string,
): ChannelResult {
  return ok ? { ok: true, provider } : { ok: false, provider, error };
}
