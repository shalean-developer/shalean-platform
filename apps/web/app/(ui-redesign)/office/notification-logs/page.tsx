"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Search,
  RefreshCw,
  AlertCircle,
  Mail,
  MessageSquare,
  Bell,
  CheckCircle2,
  XCircle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import {
  formatNotificationChannel,
  formatNotificationLogTime,
  formatNotificationStatus,
  formatNotificationTemplateLabel,
  notificationLogStatusTone,
} from "@/lib/admin/notificationLogDisplay";
import {
  OFFICE_NOTIFICATION_LOGS_PAGE_SIZE,
  type OfficeNotificationLogsListResponse,
} from "@/lib/admin/officeNotificationLogs";

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Bell,
};

export default function NotificationLogsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);

  useEffect(() => {
    const timer = globalThis.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(0);
    }, 300);
    return () => globalThis.clearTimeout(timer);
  }, [searchInput]);

  const offset = page * OFFICE_NOTIFICATION_LOGS_PAGE_SIZE;
  const params: Record<string, string> = {
    limit: String(OFFICE_NOTIFICATION_LOGS_PAGE_SIZE),
    offset: String(offset),
  };
  if (channelFilter !== "all") params.channel = channelFilter;
  if (statusFilter !== "all") params.status = statusFilter;
  if (search) params.search = search;

  const { data, loading, error, refetch } = useAdminData<OfficeNotificationLogsListResponse>(
    "/api/admin/notification-logs",
    { params },
  );

  const logs = data?.logs ?? [];
  const summary = data?.summary;
  const pagination = data?.pagination;
  const canGoPrev = (pagination?.page ?? 1) > 1;
  const canGoNext = pagination?.hasMore ?? false;

  function setChannel(next: string) {
    setChannelFilter(next);
    setPage(0);
  }

  function setStatus(next: string) {
    setStatusFilter(next);
    setPage(0);
  }

  async function handleRetry(logId: string) {
    setRetryingId(logId);
    setRetryError(null);
    const result = await adminFetch("/api/admin/notifications/retry", {
      method: "POST",
      body: JSON.stringify({ logId }),
    });
    setRetryingId(null);
    if (!result.ok) {
      setRetryError(result.error ?? "Retry failed");
      return;
    }
    void refetch();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notification Logs</h1>
          <p className="mt-0.5 text-sm text-slate-500">Live delivery history from notification_logs.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={loading}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      ) : null}

      {retryError ? (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {retryError}
          <button type="button" onClick={() => setRetryError(null)} className="ml-auto text-xs font-semibold hover:underline">
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total", value: summary?.total, color: "text-slate-800" },
          { label: "Sent", value: summary?.sent, color: "text-emerald-600" },
          { label: "Failed", value: summary?.failed, color: (summary?.failed ?? 0) > 0 ? "text-red-600" : "text-slate-400" },
          {
            label: "Success %",
            value: summary?.successRate != null ? `${summary.successRate}%` : "—",
            color: "text-blue-600",
          },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>
              {loading && !data ? "—" : k.value ?? "—"}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search recipient, template, booking…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "email", "whatsapp", "sms"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  channelFilter === c ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {c === "all" ? "All channels" : c}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {(["all", "sent", "failed"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  statusFilter === s ? "bg-blue-600 text-white" : "text-slate-500 hover:bg-slate-100",
                )}
              >
                {s === "all" ? "All statuses" : s}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                {["Time", "Channel", "Recipient", "Template", "Booking", "Status", ""].map((h) => (
                  <th
                    key={h || "actions"}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading && !data ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                    No notification logs match your filters.
                  </td>
                </tr>
              ) : (
                logs.map((l) => {
                  const CIcon = CHANNEL_ICONS[l.channel ?? ""] ?? Bell;
                  const tone = notificationLogStatusTone(l.status ?? "");
                  return (
                    <tr key={l.id} className="transition-colors hover:bg-slate-50/50">
                      <td className="px-4 py-3 font-mono text-xs text-slate-500">{formatNotificationLogTime(l.created_at)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <CIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs font-semibold text-slate-700">
                            {formatNotificationChannel(l.channel ?? "")}
                          </span>
                        </div>
                      </td>
                      <td className="max-w-[160px] truncate px-4 py-3 text-xs text-slate-600">{l.recipient ?? "—"}</td>
                      <td className="max-w-[180px] truncate px-4 py-3 text-xs text-slate-500" title={l.template_key ?? undefined}>
                        {formatNotificationTemplateLabel(l.template_key ?? "")}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono">
                        {l.booking_id ? (
                          <Link href={`/office/bookings/${l.booking_id}`} className="text-blue-600 hover:underline">
                            {l.booking_id.slice(0, 8).toUpperCase()}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {tone === "success" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : tone === "destructive" ? (
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                          ) : null}
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              tone === "success" ? "text-emerald-600" : tone === "destructive" ? "text-red-600" : "text-slate-600",
                            )}
                          >
                            {formatNotificationStatus(l.status ?? "")}
                          </span>
                        </div>
                        {l.error ? (
                          <p className="mt-0.5 max-w-[160px] truncate text-[10px] text-red-400" title={l.error}>
                            {l.error}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {l.status === "failed" ? (
                          <button
                            type="button"
                            disabled={retryingId === l.id}
                            onClick={() => void handleRetry(l.id)}
                            className="text-xs font-bold text-blue-600 hover:underline disabled:opacity-50"
                          >
                            {retryingId === l.id ? "Retrying…" : "Retry"}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {pagination && pagination.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3">
            <p className="text-xs text-slate-500">
              {loading
                ? "Loading…"
                : `Showing ${pagination.offset + 1}–${pagination.offset + logs.length} of ${pagination.total}`}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!canGoPrev || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
                Previous
              </button>
              <span className="text-xs font-medium tabular-nums text-slate-500">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                disabled={!canGoNext || loading}
                onClick={() => setPage((p) => p + 1)}
                className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
