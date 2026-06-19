import {
  formatNotificationChannel,
  formatNotificationLogTitle,
  formatNotificationStatus,
  notificationLogStatusTone,
} from "@/lib/admin/notificationLogDisplay";

export type OfficeNotificationChannel = "email" | "whatsapp" | "sms";

export type OfficeNotificationLogRow = {
  id: string;
  channel: string | null;
  template_key: string | null;
  recipient: string | null;
  status: string | null;
  role?: string | null;
  created_at?: string | null;
  booking_id?: string | null;
  error?: string | null;
  payload?: Record<string, unknown> | null;
};

export type OfficeNotificationChannelStat = {
  channel: OfficeNotificationChannel;
  label: string;
  sent: number;
  failed: number;
  successRate: number | null;
};

export type OfficeNotificationAudienceCounts = {
  allCustomers: number;
  allCleaners: number;
  bookingsToday: number;
  unassignedToday: number;
};

export type OfficeNotificationsLogPagination = {
  limit: number;
  offset: number;
  total: number;
  hasMore: boolean;
  page: number;
  totalPages: number;
};

export type OfficeNotificationsSummary = {
  fetchedAt: string;
  dateYmd: string;
  channels: OfficeNotificationChannelStat[];
  recentLogs: Array<{
    id: string;
    title: string;
    subtitle: string;
    recipient: string;
    status: string;
    statusLabel: string;
    statusTone: "success" | "destructive" | "muted";
    timeLabel: string;
    canRetry: boolean;
  }>;
  totals: {
    sent: number;
    failed: number;
    successRate: number | null;
  };
  audiences: OfficeNotificationAudienceCounts;
  whatsappPausedUntil: string | null;
  logsPagination: OfficeNotificationsLogPagination;
};

const CHANNEL_ORDER: OfficeNotificationChannel[] = ["email", "whatsapp", "sms"];

function norm(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isOfficeNotificationChannel(value: string): value is OfficeNotificationChannel {
  return value === "email" || value === "whatsapp" || value === "sms";
}

export function computeOfficeNotificationChannelStats(
  rows: Array<{ channel: string | null; status: string | null }>,
): OfficeNotificationChannelStat[] {
  return CHANNEL_ORDER.map((channel) => {
    let sent = 0;
    let failed = 0;
    for (const row of rows) {
      if (norm(row.channel) !== channel) continue;
      const status = norm(row.status);
      if (status === "sent") sent += 1;
      else if (status === "failed") failed += 1;
    }
    const total = sent + failed;
    return {
      channel,
      label: formatNotificationChannel(channel),
      sent,
      failed,
      successRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : null,
    };
  });
}

export function computeOfficeNotificationTotals(channels: OfficeNotificationChannelStat[]): {
  sent: number;
  failed: number;
  successRate: number | null;
} {
  const sent = channels.reduce((sum, c) => sum + c.sent, 0);
  const failed = channels.reduce((sum, c) => sum + c.failed, 0);
  const total = sent + failed;
  return {
    sent,
    failed,
    successRate: total > 0 ? Math.round((sent / total) * 1000) / 10 : null,
  };
}

export function formatOfficeNotificationClock(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function mapOfficeNotificationRecentLog(row: OfficeNotificationLogRow): OfficeNotificationsSummary["recentLogs"][number] {
  const channel = norm(row.channel);
  const status = norm(row.status);
  const displayRow = {
    id: row.id,
    channel: channel || "email",
    template_key: row.template_key ?? "",
    status: status || "unknown",
    role: row.role ?? null,
    created_at: row.created_at ?? null,
    payload: row.payload ?? null,
  };
  return {
    id: row.id,
    title: formatNotificationLogTitle(displayRow),
    subtitle: `${formatNotificationChannel(channel)} · ${row.recipient?.trim() || "Unknown recipient"}`,
    recipient: row.recipient?.trim() || "Unknown recipient",
    status,
    statusLabel: formatNotificationStatus(status),
    statusTone: notificationLogStatusTone(status),
    timeLabel: formatOfficeNotificationClock(row.created_at),
    canRetry: status === "failed" && isOfficeNotificationChannel(channel),
  };
}

type BookingAudienceRow = {
  customer_email: string | null;
  cleaner_id: string | null;
  selected_cleaner_id?: string | null;
  team_id?: string | null;
  status: string | null;
};

export function countDistinctCustomerEmails(rows: Array<{ customer_email: string | null }>): number {
  const emails = new Set<string>();
  for (const row of rows) {
    const email = row.customer_email?.trim().toLowerCase();
    if (email) emails.add(email);
  }
  return emails.size;
}

export function computeOfficeNotificationAudienceCounts(params: {
  customerEmailRows: Array<{ customer_email: string | null }>;
  cleanerCount: number;
  todayBookings: BookingAudienceRow[];
}): OfficeNotificationAudienceCounts {
  const activeToday = params.todayBookings.filter((b) => {
    const st = norm(b.status);
    return st !== "cancelled" && st !== "failed" && st !== "payment_expired";
  });

  let unassignedToday = 0;
  for (const booking of activeToday) {
    const st = norm(booking.status);
    if (st === "completed") continue;
    const hasAssignment =
      Boolean(booking.cleaner_id?.trim()) ||
      Boolean(booking.selected_cleaner_id?.trim()) ||
      Boolean(booking.team_id?.trim());
    if (!hasAssignment) unassignedToday += 1;
  }

  return {
    allCustomers: countDistinctCustomerEmails(params.customerEmailRows),
    allCleaners: Math.max(0, params.cleanerCount),
    bookingsToday: activeToday.length,
    unassignedToday,
  };
}

export function computeOfficeNotificationLogPagination(params: {
  limit: number;
  offset: number;
  total: number;
  rowCount: number;
}): OfficeNotificationsLogPagination {
  const limit = Math.max(1, params.limit);
  const offset = Math.max(0, params.offset);
  const total = Math.max(0, params.total);
  const page = Math.floor(offset / limit) + 1;
  const totalPages = total > 0 ? Math.ceil(total / limit) : 1;
  return {
    limit,
    offset,
    total,
    hasMore: offset + params.rowCount < total,
    page,
    totalPages,
  };
}

export function buildOfficeNotificationsSummary(params: {
  fetchedAt: string;
  dateYmd: string;
  todayRows: OfficeNotificationLogRow[];
  recentRows: OfficeNotificationLogRow[];
  audiences: OfficeNotificationAudienceCounts;
  whatsappPausedUntil: string | null;
  logsPagination: OfficeNotificationsLogPagination;
}): OfficeNotificationsSummary {
  const channels = computeOfficeNotificationChannelStats(params.todayRows);
  return {
    fetchedAt: params.fetchedAt,
    dateYmd: params.dateYmd,
    channels,
    recentLogs: params.recentRows.map(mapOfficeNotificationRecentLog),
    totals: computeOfficeNotificationTotals(channels),
    audiences: params.audiences,
    whatsappPausedUntil: params.whatsappPausedUntil,
    logsPagination: params.logsPagination,
  };
}
