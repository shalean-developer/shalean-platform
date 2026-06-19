"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Bell,
  Mail,
  MessageSquare,
  Send,
  AlertTriangle,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { adminFetch, useAdminData } from "@/hooks/useAdminData";
import type { OfficeNotificationsSummary } from "@/lib/admin/officeNotifications";

const CHANNEL_META: Record<
  OfficeNotificationsSummary["channels"][number]["channel"],
  { icon: typeof Mail; color: string }
> = {
  email: { icon: Mail, color: "bg-blue-50 text-blue-600" },
  whatsapp: { icon: MessageSquare, color: "bg-emerald-50 text-emerald-600" },
  sms: { icon: Bell, color: "bg-violet-50 text-violet-600" },
};

const AUDIENCE_OPTIONS = [
  { id: "all_customers", label: "All customers", countKey: "allCustomers" as const },
  { id: "all_cleaners", label: "All cleaners", countKey: "allCleaners" as const },
  { id: "bookings_today", label: "Customers with bookings today", countKey: "bookingsToday" as const },
  { id: "unassigned", label: "Customers with unassigned bookings", countKey: "unassignedToday" as const },
];

const LOGS_PAGE_SIZE = 10;

export default function NotificationsPage() {
  const [tab, setTab] = useState<"overview" | "send">("overview");
  const [recipientType, setRecipientType] = useState("all_customers");
  const [message, setMessage] = useState("");
  const [channel, setChannel] = useState("email");
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [retryError, setRetryError] = useState<string | null>(null);
  const [logsPage, setLogsPage] = useState(0);

  const logsOffset = logsPage * LOGS_PAGE_SIZE;

  const { data, loading, error, refetch } = useAdminData<OfficeNotificationsSummary>("/api/admin/office-notifications", {
    params: { limit: String(LOGS_PAGE_SIZE), offset: String(logsOffset) },
  });

  const pagination = data?.logsPagination;
  const canGoPrev = (pagination?.page ?? 1) > 1;
  const canGoNext = pagination?.hasMore ?? false;

  const selectedAudience = AUDIENCE_OPTIONS.find((o) => o.id === recipientType) ?? AUDIENCE_OPTIONS[0]!;
  const recipientCount = data?.audiences[selectedAudience.countKey] ?? 0;

  const whatsappPaused = useMemo(() => {
    if (!data?.whatsappPausedUntil) return false;
    const until = Date.parse(data.whatsappPausedUntil);
    return Number.isFinite(until) && until > Date.now();
  }, [data?.whatsappPausedUntil]);

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
          <h1 className="text-2xl font-bold text-slate-900">Notifications</h1>
          <p className="mt-0.5 text-sm text-slate-500">
            Delivery stats and logs from notification_logs.
            {data?.dateYmd ? <span className="ml-1 text-slate-400">· Today ({data.dateYmd})</span> : null}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={loading}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            aria-label="Refresh notifications"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </button>
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
            {(["overview", "send"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-colors",
                  tab === t ? "bg-blue-600 text-white" : "text-slate-500 hover:text-slate-700",
                )}
              >
                {t === "overview" ? "Overview" : "Send notification"}
              </button>
            ))}
          </div>
        </div>
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

      {whatsappPaused ? (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            WhatsApp delivery is temporarily paused until{" "}
            {new Date(data!.whatsappPausedUntil!).toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg" })}.
          </p>
        </div>
      ) : null}

      {tab === "overview" ? (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Sent today", value: data?.totals.sent, color: "text-emerald-600" },
              { label: "Failed today", value: data?.totals.failed, color: data?.totals.failed ? "text-red-600" : "text-slate-400" },
              {
                label: "Success rate",
                value: data?.totals.successRate != null ? `${data.totals.successRate}%` : "—",
                color: "text-blue-600",
              },
              { label: "All logs", value: pagination?.total ?? 0, color: "text-slate-800" },
            ].map((k) => (
              <div key={k.label} className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
                <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{loading && !data ? "—" : k.value ?? "—"}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {(data?.channels ?? [{ channel: "email" }, { channel: "whatsapp" }, { channel: "sms" }]).map((c) => {
              const meta = CHANNEL_META[c.channel as keyof typeof CHANNEL_META];
              const CIcon = meta?.icon ?? Bell;
              const stat = data?.channels.find((row) => row.channel === c.channel);
              return (
                <div key={c.channel} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
                  <div className={cn("mb-3 flex h-9 w-9 items-center justify-center rounded-xl", meta?.color ?? "bg-slate-50 text-slate-600")}>
                    <CIcon className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{stat?.label ?? c.channel}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-slate-800">{loading && !data ? "—" : stat?.sent ?? 0}</p>
                  <p className="text-xs text-slate-400">Delivered today</p>
                  {(stat?.failed ?? 0) > 0 ? (
                    <div className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-600">
                      <AlertTriangle className="h-3.5 w-3.5" /> {stat!.failed} failed
                    </div>
                  ) : null}
                  {stat?.successRate != null ? (
                    <p className="mt-1 text-xs font-semibold text-emerald-600">{stat.successRate}% success rate</p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">No messages today</p>
                  )}
                </div>
              );
            })}
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h3 className="text-sm font-bold text-slate-800">Recent delivery logs</h3>
              <Link href="/office/notification-logs" className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline">
                View all <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            {loading && !data ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
                ))}
              </div>
            ) : (data?.recentLogs.length ?? 0) === 0 ? (
              <div className="py-12 text-center text-sm text-slate-400">No notification logs yet.</div>
            ) : (
              <>
                <div className="divide-y divide-slate-50">
                  {data!.recentLogs.map((l) => (
                    <div key={l.id} className="flex items-center gap-4 px-5 py-3">
                      <span className="w-10 shrink-0 font-mono text-xs text-slate-400">{l.timeLabel}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800">{l.title}</p>
                        <p className="truncate text-xs text-slate-400">{l.subtitle}</p>
                      </div>
                      <span
                        className={cn(
                          "inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold",
                          l.statusTone === "success"
                            ? "bg-emerald-100 text-emerald-700"
                            : l.statusTone === "destructive"
                              ? "bg-red-100 text-red-700"
                              : "bg-slate-100 text-slate-700",
                        )}
                      >
                        {l.statusTone === "success" ? <CheckCircle2 className="h-3 w-3" /> : l.statusTone === "destructive" ? <XCircle className="h-3 w-3" /> : null}
                        {l.statusLabel}
                      </span>
                      {l.canRetry ? (
                        <button
                          type="button"
                          disabled={retryingId === l.id}
                          onClick={() => void handleRetry(l.id)}
                          className="shrink-0 text-xs font-bold text-blue-600 hover:underline disabled:opacity-50"
                        >
                          {retryingId === l.id ? "Retrying…" : "Retry"}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                {pagination && pagination.total > 0 ? (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
                    <p className="text-xs text-slate-500">
                      Showing {pagination.offset + 1}–{pagination.offset + data!.recentLogs.length} of {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={!canGoPrev || loading}
                        onClick={() => setLogsPage((p) => Math.max(0, p - 1))}
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
                        onClick={() => setLogsPage((p) => p + 1)}
                        className="flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="flex items-start gap-2 rounded-2xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
            <p>
              Automated booking notifications are sent from templates. Bulk manual send is not enabled yet — use booking actions or{" "}
              <Link href="/office/notification-logs" className="font-semibold underline">
                retry failed logs
              </Link>
              .
            </p>
          </div>

          <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
            <h3 className="mb-4 text-sm font-bold text-slate-800">Audience preview</h3>
            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Channel</label>
                <div className="flex gap-2">
                  {["email", "sms", "whatsapp"].map((ch) => (
                    <button
                      key={ch}
                      type="button"
                      onClick={() => setChannel(ch)}
                      className={cn(
                        "rounded-xl border px-4 py-2 text-sm font-semibold capitalize transition-colors",
                        channel === ch ? "border-blue-600 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:bg-slate-50",
                      )}
                    >
                      {ch}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Recipients</label>
                <select
                  value={recipientType}
                  onChange={(e) => setRecipientType(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700 focus:border-blue-300 focus:outline-none"
                >
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-slate-500">
                  {loading && !data
                    ? "Counting recipients…"
                    : `${recipientCount.toLocaleString("en-ZA")} recipient${recipientCount === 1 ? "" : "s"} in database`}
                </p>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-slate-700">Message draft</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value.slice(0, 500))}
                  rows={5}
                  placeholder="Draft a message for planning — sending is not wired yet."
                  className="w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-300 focus:outline-none"
                />
                <p className="mt-1 text-right text-xs text-slate-400">{message.length} / 500</p>
              </div>
              <div className="flex gap-2">
                <Link
                  href="/office/templates"
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Manage templates
                </Link>
                <button
                  type="button"
                  disabled
                  title="Bulk send is not enabled"
                  className="flex cursor-not-allowed items-center gap-2 rounded-xl bg-slate-200 px-6 py-2 text-sm font-bold text-slate-500"
                >
                  <Send className="h-4 w-4" /> Send now
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
