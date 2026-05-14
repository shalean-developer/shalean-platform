export const ADMIN_DASHBOARD_REVENUE_SCOPE_LABEL =
  "Booking payments only; monthly invoice collections excluded.";

export const ADMIN_DASHBOARD_CONVERSION_SOURCE_LABEL =
  "Conversion uses booking_events plus selected user_events over the last 30 days.";

export function notificationMetricHeadline(input: {
  available?: boolean;
  error?: string;
  email: { sent: number; failed: number };
  whatsapp: { sent: number; failed: number };
  sms: { sent: number; failed: number };
  whatsappSuccessRatePct: number | null;
}): string {
  if (input.available === false) return "Data unavailable";
  const waTotal = input.whatsapp.sent + input.whatsapp.failed;
  const waRate = input.whatsappSuccessRatePct != null ? ` (${input.whatsappSuccessRatePct}%)` : "";
  return [
    `Email ${input.email.sent} accepted${input.email.failed > 0 ? ` - ${input.email.failed} failed` : ""}`,
    `WhatsApp ${input.whatsapp.sent}/${waTotal || 0} accepted${waRate}`,
    `SMS ${input.sms.sent} accepted${input.sms.failed > 0 ? ` - ${input.sms.failed} failed` : ""}`,
  ].join(" | ");
}

export function notificationMetricDetail(input: { available?: boolean; error?: string }): string | null {
  if (input.available !== false) return null;
  return `Could not read notification logs.${input.error ? ` Error: ${input.error}` : ""}`;
}

export function dashboardFetchedAtLabel(fetchedAtIso: string | null | undefined, nowMs = Date.now()): string {
  if (!fetchedAtIso) return "Fetched: unavailable";
  const t = new Date(fetchedAtIso).getTime();
  if (!Number.isFinite(t)) return "Fetched: unavailable";
  const ageSeconds = Math.max(0, Math.floor((nowMs - t) / 1000));
  if (ageSeconds < 60) return "Fetched just now";
  const ageMinutes = Math.floor(ageSeconds / 60);
  if (ageMinutes < 60) return `Fetched ${ageMinutes}m ago`;
  const ageHours = Math.floor(ageMinutes / 60);
  return `Fetched ${ageHours}h ago`;
}

export function dashboardStaleBadgeTone(fetchedAtIso: string | null | undefined, nowMs = Date.now()): "fresh" | "stale" {
  if (!fetchedAtIso) return "stale";
  const t = new Date(fetchedAtIso).getTime();
  if (!Number.isFinite(t)) return "stale";
  return nowMs - t > 5 * 60_000 ? "stale" : "fresh";
}
