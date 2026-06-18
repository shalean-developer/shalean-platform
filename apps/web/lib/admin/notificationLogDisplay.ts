export type NotificationLogDisplayRow = {
  id: string;
  channel: string;
  template_key: string;
  status: string;
  role?: string | null;
  created_at?: string | null;
  payload?: Record<string, unknown> | null;
};

const TEMPLATE_LABELS: Record<string, string> = {
  legacy_booking_confirmation_html: "Booking confirmation",
  admin_payment_confirmed: "Payment confirmed",
  booking_confirmed: "Booking confirmed",
  booking_payment_processing: "Payment processing",
  dispatch_offer_link: "Job offer to cleaner",
  payment_link: "Payment link",
  booking_recovery_saved_quote: "Saved quote reminder",
  review_prompt: "Review request",
  booking_assigned: "Cleaner assigned",
  booking_cancelled: "Booking cancelled",
  booking_rescheduled: "Booking rescheduled",
  reminder_2h: "2-hour reminder",
  job_completed: "Job completed",
};

const CHANNEL_LABELS: Record<string, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
};

const STATUS_LABELS: Record<string, string> = {
  sent: "Sent",
  failed: "Failed",
  pending: "Pending",
  delivered: "Delivered",
  skipped: "Skipped",
};

function norm(value: string): string {
  return value.trim().toLowerCase();
}

function humanizeKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b(html|sms|v2)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function formatNotificationChannel(channel: string): string {
  const key = norm(channel);
  return CHANNEL_LABELS[key] ?? (key ? humanizeKey(key) : "Message");
}

export function formatNotificationStatus(status: string): string {
  const key = norm(status);
  return STATUS_LABELS[key] ?? (key ? humanizeKey(key) : "Unknown");
}

export function formatNotificationTemplateLabel(templateKey: string): string {
  const key = templateKey.trim();
  if (!key) return "Notification";
  return TEMPLATE_LABELS[key] ?? humanizeKey(key);
}

export function formatNotificationLogTitle(row: NotificationLogDisplayRow): string {
  return formatNotificationTemplateLabel(row.template_key);
}

export function formatNotificationLogSubtitle(row: NotificationLogDisplayRow): string {
  const channel = formatNotificationChannel(row.channel);
  const role = row.role?.trim();
  return role ? `${channel} · ${humanizeKey(role)}` : channel;
}

export function notificationLogStatusTone(status: string): "success" | "destructive" | "muted" {
  const key = norm(status);
  if (key === "sent" || key === "delivered") return "success";
  if (key === "failed") return "destructive";
  return "muted";
}

export function formatNotificationLogTime(createdAt: string | null | undefined): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function notificationLogHasRetry(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== "object") return false;
  return typeof payload.retried_from === "string" && payload.retried_from.trim().length > 0;
}

export function notificationLogIsSmsFallback(payload: Record<string, unknown> | null | undefined): boolean {
  if (!payload || typeof payload !== "object") return false;
  return payload.automated_channel_fallback === true;
}
