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
  admin_payment_confirmed: "Payment confirmed (admin)",
  booking_confirmed: "Booking confirmed",
  booking_payment_processing: "Payment processing",
  payment_link: "Payment link",
  payment_request: "Payment request",
  booking_recovery_saved_quote: "Saved quote reminder",
  dispatch_offer_link: "Job offer link (SMS)",
  review_prompt: "Review request",
  review_prompt_sms: "Review request (SMS)",
  review_prompt_sms_reminder: "Review reminder (SMS)",
  booking_assigned: "Cleaner assigned",
  booking_cancelled: "Booking cancelled",
  booking_rescheduled: "Booking rescheduled",
  booking_reminder_24h: "24-hour reminder",
  reminder_2h: "2-hour reminder",
  reminder: "Job reminder (WhatsApp)",
  job_completed: "Job completed",
  booking_offer: "Cleaner job offer",
  escalation: "Dispatch escalation",
  offer_ack: "Offer acknowledgement",
  cleaner_welcome: "Cleaner welcome",
  cleaner_approved: "Cleaner approved",
  cleaner_assignment_sms_direct: "Cleaner assignment (SMS)",
  cleaner_reminder_2h_sms_direct: "Cleaner 2h reminder (SMS)",
  cleaner_dispatch_offer_lost_race_sms: "Lost dispatch race (SMS)",
  cleaner_booking_paid_off_platform: "Cleaner paid notification (SMS)",
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
