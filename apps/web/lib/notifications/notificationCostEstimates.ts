/** Rough marginal cost for ops dashboards (not billing truth). Override via env if needed. */
export const NOTIFICATION_COST_CURRENCY = "USD";

function numEnv(key: string, fallback: number): number {
  const n = Number(process.env[key]);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** Single-message estimate in USD by channel. */
export function estimatedNotificationCostUsd(channel: "email" | "whatsapp" | "sms"): number {
  switch (channel) {
    case "email":
      return numEnv("NOTIFICATION_COST_EMAIL_USD", 0.0004);
    case "whatsapp":
      return numEnv("NOTIFICATION_COST_WHATSAPP_USD", 0.005);
    case "sms":
      return numEnv("NOTIFICATION_COST_SMS_USD", 0.08);
    default:
      return 0;
  }
}
