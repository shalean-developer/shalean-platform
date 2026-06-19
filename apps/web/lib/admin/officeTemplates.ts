import { formatNotificationChannel, formatNotificationTemplateLabel } from "@/lib/admin/notificationLogDisplay";
import type { TemplateChannel, TemplateRow } from "@/lib/templates/types";

export type OfficeTemplateChannel = TemplateChannel;

export type OfficeTemplateUsage = {
  sent: number;
  failed: number;
  lastSentAt: string | null;
  lastSentLabel: string | null;
};

export type OfficeTemplateItem = {
  id: string;
  key: string;
  name: string;
  channel: OfficeTemplateChannel;
  channelLabel: string;
  trigger: string;
  status: "active" | "inactive";
  statusLabel: string;
  subject: string | null;
  content: string;
  contentPreview: string;
  variables: string[];
  updatedAt: string | null;
  updatedLabel: string;
  usage: OfficeTemplateUsage;
};

export type OfficeTemplateChannelStat = {
  channel: OfficeTemplateChannel;
  label: string;
  count: number;
  activeCount: number;
};

export type OfficeTemplatesSummary = {
  fetchedAt: string;
  channels: OfficeTemplateChannelStat[];
  templates: OfficeTemplateItem[];
  totals: {
    total: number;
    active: number;
    sent30d: number;
    failed30d: number;
  };
};

const CHANNEL_ORDER: OfficeTemplateChannel[] = ["email", "whatsapp", "sms"];

const TEMPLATE_TRIGGERS: Record<string, string> = {
  booking_confirmed: "On booking confirmed",
  booking_payment_processing: "On payment processing",
  legacy_booking_confirmation_html: "Legacy booking confirmation email",
  admin_payment_confirmed: "When admin marks booking paid",
  payment_link: "When payment link is sent",
  booking_recovery_saved_quote: "Saved quote recovery email",
  dispatch_offer_link: "Dispatch job offer link (SMS)",
  booking_offer: "Cleaner job offer (WhatsApp)",
  booking_assigned: "On cleaner assignment",
  reminder: "Job reminder (WhatsApp)",
  escalation: "Dispatch escalation (WhatsApp)",
  offer_ack: "Offer acknowledgement (WhatsApp)",
  cleaner_welcome: "Cleaner welcome (WhatsApp)",
  cleaner_approved: "Cleaner approved (WhatsApp)",
  payment_request: "Payment request (SMS)",
  booking_reminder_24h: "24 hours before booking",
  review_prompt: "Review request after completion",
  review_prompt_sms: "Review request (SMS)",
  review_prompt_sms_reminder: "Review reminder (SMS)",
  booking_cancelled: "On booking cancelled",
  booking_rescheduled: "On booking rescheduled",
  reminder_2h: "2 hours before booking",
  job_completed: "On job completed",
  cleaner_booking_paid_off_platform: "Cleaner notified of off-platform payment",
  cleaner_assignment_sms_direct: "Cleaner assignment (SMS)",
  cleaner_reminder_2h_sms_direct: "Cleaner 2h reminder (SMS)",
  cleaner_dispatch_offer_lost_race_sms: "Cleaner lost dispatch race (SMS)",
};

type NotificationLogAggRow = {
  template_key: string | null;
  channel: string | null;
  status: string | null;
  created_at: string | null;
};

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isOfficeTemplateChannel(value: string): value is OfficeTemplateChannel {
  return value === "email" || value === "whatsapp" || value === "sms";
}

function parseVariables(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function formatTemplateDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

function formatTemplateDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleString("en-ZA", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function resolveOfficeTemplateTrigger(templateKey: string): string {
  const key = templateKey.trim();
  if (!key) return "Automated notification";
  return TEMPLATE_TRIGGERS[key] ?? "Automated notification";
}

export function buildTemplateUsageKey(templateKey: string, channel: string): string {
  return `${norm(templateKey)}:${norm(channel)}`;
}

export function aggregateOfficeTemplateUsage(
  rows: NotificationLogAggRow[],
): Map<string, OfficeTemplateUsage> {
  const map = new Map<string, OfficeTemplateUsage>();

  for (const row of rows) {
    const templateKey = norm(row.template_key);
    const channel = norm(row.channel);
    if (!templateKey || !isOfficeTemplateChannel(channel)) continue;

    const mapKey = buildTemplateUsageKey(templateKey, channel);
    const current = map.get(mapKey) ?? { sent: 0, failed: 0, lastSentAt: null, lastSentLabel: null };
    const status = norm(row.status);
    if (status === "sent" || status === "delivered") current.sent += 1;
    else if (status === "failed") current.failed += 1;

    const createdAt = row.created_at ?? null;
    if (createdAt && (!current.lastSentAt || createdAt > current.lastSentAt)) {
      current.lastSentAt = createdAt;
      current.lastSentLabel = formatTemplateDateTime(createdAt);
    }
    map.set(mapKey, current);
  }

  return map;
}

export function buildOfficeTemplateChannelStats(templates: OfficeTemplateItem[]): OfficeTemplateChannelStat[] {
  return CHANNEL_ORDER.map((channel) => {
    const rows = templates.filter((t) => t.channel === channel);
    return {
      channel,
      label: formatNotificationChannel(channel),
      count: rows.length,
      activeCount: rows.filter((t) => t.status === "active").length,
    };
  });
}

export function mapOfficeTemplateRow(
  row: TemplateRow,
  usageByKey: Map<string, OfficeTemplateUsage>,
): OfficeTemplateItem {
  const channel = isOfficeTemplateChannel(norm(row.channel)) ? (norm(row.channel) as OfficeTemplateChannel) : "email";
  const usage =
    usageByKey.get(buildTemplateUsageKey(row.key, channel)) ?? {
      sent: 0,
      failed: 0,
      lastSentAt: null,
      lastSentLabel: null,
    };
  const content = String(row.content ?? "");
  const contentPreview =
    content.length > 140 ? `${content.slice(0, 140).trim()}…` : content.trim() || "—";

  return {
    id: row.id,
    key: row.key,
    name: formatNotificationTemplateLabel(row.key),
    channel,
    channelLabel: formatNotificationChannel(channel),
    trigger: resolveOfficeTemplateTrigger(row.key),
    status: row.is_active ? "active" : "inactive",
    statusLabel: row.is_active ? "Active" : "Inactive",
    subject: row.subject ?? null,
    content,
    contentPreview,
    variables: parseVariables(row.variables),
    updatedAt: row.updated_at ?? row.created_at ?? null,
    updatedLabel: formatTemplateDate(row.updated_at ?? row.created_at ?? null),
    usage,
  };
}

export function buildOfficeTemplatesSummary(params: {
  fetchedAt: string;
  templateRows: TemplateRow[];
  usageRows: NotificationLogAggRow[];
}): OfficeTemplatesSummary {
  const usageByKey = aggregateOfficeTemplateUsage(params.usageRows);
  const templates = params.templateRows
    .map((row) => mapOfficeTemplateRow(row, usageByKey))
    .sort((a, b) => {
      const keyCmp = a.key.localeCompare(b.key);
      if (keyCmp !== 0) return keyCmp;
      return a.channel.localeCompare(b.channel);
    });

  const channels = buildOfficeTemplateChannelStats(templates);
  const sent30d = templates.reduce((sum, t) => sum + t.usage.sent, 0);
  const failed30d = templates.reduce((sum, t) => sum + t.usage.failed, 0);

  return {
    fetchedAt: params.fetchedAt,
    channels,
    templates,
    totals: {
      total: templates.length,
      active: templates.filter((t) => t.status === "active").length,
      sent30d,
      failed30d,
    },
  };
}
