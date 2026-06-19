import { computeOfficeNotificationLogPagination } from "@/lib/admin/officeNotifications";

export type OfficeNotificationLogFilters = {
  booking_id?: string | null;
  status?: string | null;
  channel?: string | null;
  template_key?: string | null;
  role?: string | null;
  event_type?: string | null;
  search?: string | null;
};

export type OfficeNotificationLogRow = {
  id: string;
  booking_id: string | null;
  channel: string | null;
  template_key: string | null;
  recipient: string | null;
  status: string | null;
  error: string | null;
  provider: string | null;
  role: string | null;
  event_type: string | null;
  created_at: string;
};

export type OfficeNotificationLogsListResponse = {
  logs: OfficeNotificationLogRow[];
  limit: number;
  offset: number;
  hasMore: boolean;
  summary: {
    total: number;
    sent: number;
    failed: number;
    successRate: number | null;
  };
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
    page: number;
    totalPages: number;
  };
};

export const OFFICE_NOTIFICATION_LOGS_PAGE_SIZE = 20;

export function sanitizeNotificationLogSearch(raw: string | null | undefined): string | null {
  const trimmed = String(raw ?? "").trim().slice(0, 100);
  if (!trimmed) return null;
  return trimmed.replace(/[%_]/g, "");
}

export function notificationLogSearchPattern(search: string | null | undefined): string | null {
  const sanitized = sanitizeNotificationLogSearch(search);
  if (!sanitized) return null;
  return `%${sanitized}%`;
}

export function computeOfficeNotificationLogsSummary(params: {
  total: number;
  sent: number;
  failed: number;
}): OfficeNotificationLogsListResponse["summary"] {
  const attempts = params.sent + params.failed;
  return {
    total: params.total,
    sent: params.sent,
    failed: params.failed,
    successRate: attempts > 0 ? Math.round((params.sent / attempts) * 1000) / 10 : null,
  };
}

export function buildOfficeNotificationLogsListResponse(params: {
  logs: OfficeNotificationLogRow[];
  limit: number;
  offset: number;
  total: number;
  sent: number;
  failed: number;
}): OfficeNotificationLogsListResponse {
  const pagination = computeOfficeNotificationLogPagination({
    limit: params.limit,
    offset: params.offset,
    total: params.total,
    rowCount: params.logs.length,
  });
  return {
    logs: params.logs,
    limit: params.limit,
    offset: params.offset,
    hasMore: pagination.hasMore,
    summary: computeOfficeNotificationLogsSummary({
      total: params.total,
      sent: params.sent,
      failed: params.failed,
    }),
    pagination,
  };
}

/** Applies list filters to a Supabase query builder (typed loosely to avoid TS depth limits). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOfficeNotificationLogFilters(query: any, filters: OfficeNotificationLogFilters): any {
  let q = query;
  const bookingId = filters.booking_id?.trim();
  if (bookingId) q = q.eq("booking_id", bookingId);

  const status = filters.status?.trim();
  if (status === "sent" || status === "failed") q = q.eq("status", status);

  const channel = filters.channel?.trim();
  if (channel === "email" || channel === "whatsapp" || channel === "sms") q = q.eq("channel", channel);

  const templateKey = filters.template_key?.trim();
  if (templateKey) q = q.eq("template_key", templateKey);

  const role = filters.role?.trim();
  if (role) q = q.eq("role", role);

  const eventType = filters.event_type?.trim();
  if (eventType) q = q.eq("event_type", eventType);

  const pattern = notificationLogSearchPattern(filters.search);
  if (pattern) {
    q = q.or(`recipient.ilike.${pattern},template_key.ilike.${pattern},booking_id.ilike.${pattern}`);
  }

  return q;
}

export function parseOfficeNotificationLogsLimit(raw: string | null, fallback = OFFICE_NOTIFICATION_LOGS_PAGE_SIZE): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(100, Math.max(1, n));
}

export function parseOfficeNotificationLogsOffset(raw: string | null): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, n);
}
