"use client";

import { cn } from "@/lib/utils";
import {
  formatNotificationLogSubtitle,
  formatNotificationLogTime,
  formatNotificationLogTitle,
  formatNotificationStatus,
  notificationLogHasRetry,
  notificationLogIsSmsFallback,
  notificationLogStatusTone,
  type NotificationLogDisplayRow,
} from "@/lib/admin/notificationLogDisplay";

function StatusBadge({ status }: { status: string }) {
  const tone = notificationLogStatusTone(status);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
        tone === "success" && "bg-emerald-100 text-emerald-700",
        tone === "destructive" && "bg-red-100 text-red-700",
        tone === "muted" && "bg-slate-100 text-slate-600",
      )}
    >
      {formatNotificationStatus(status)}
    </span>
  );
}

function TimelineRow({
  row,
  compact = false,
}: {
  row: NotificationLogDisplayRow;
  compact?: boolean;
}) {
  const title = formatNotificationLogTitle(row);
  const subtitle = formatNotificationLogSubtitle(row);
  const time = formatNotificationLogTime(row.created_at);
  const retried = notificationLogHasRetry(row.payload);
  const smsFallback = notificationLogIsSmsFallback(row.payload);

  return (
    <div
      className={cn(
        "rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5",
        !compact && "px-3.5 py-3",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          {retried ? <p className="mt-1 text-[11px] text-slate-400">Retry attempt</p> : null}
          {smsFallback ? (
            <p className="mt-1 text-[11px] font-medium text-amber-800">SMS fallback after WhatsApp</p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusBadge status={row.status} />
          {time ? (
            <time className="whitespace-nowrap text-[11px] tabular-nums text-slate-400" dateTime={row.created_at ?? undefined}>
              {time}
            </time>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function BookingNotificationTimeline({
  rows,
  loading = false,
  emptyMessage = "No outbound logs yet",
  compact = false,
  limit,
}: {
  rows: NotificationLogDisplayRow[];
  loading?: boolean;
  emptyMessage?: string;
  compact?: boolean;
  limit?: number;
}) {
  if (loading) {
    return <p className="text-sm text-slate-500">Loading notification history…</p>;
  }

  const visible = limit != null ? rows.slice(0, limit) : rows;
  if (visible.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  return (
    <div className={cn("space-y-2", !compact && "space-y-2.5")}>
      {visible.map((row) => (
        <TimelineRow key={row.id} row={row} compact={compact} />
      ))}
    </div>
  );
}
