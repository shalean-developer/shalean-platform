"use client";

import { useState } from "react";
import { Search, RefreshCw, AlertCircle, Mail, MessageSquare, Bell, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";

type LogRow = {
  id: string;
  booking_id: string | null;
  channel: string | null;
  template_key: string | null;
  recipient: string | null;
  status: "sent" | "failed" | string;
  error: string | null;
  provider: string | null;
  role: string | null;
  event_type: string | null;
  created_at: string;
};

type LogsResponse = {
  logs: LogRow[];
  limit: number;
  offset: number;
};

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  whatsapp: MessageSquare,
  sms: Bell,
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function NotificationLogsPage() {
  const [search, setSearch] = useState("");
  const [channelFilter, setChannelFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const params: Record<string, string> = { limit: "100" };
  if (channelFilter !== "all") params.channel = channelFilter;
  if (statusFilter !== "all") params.status = statusFilter;

  const { data, loading, error, refetch } = useAdminData<LogsResponse>(
    "/api/admin/notification-logs",
    { params },
  );

  const logs = data?.logs ?? [];

  const filtered = logs.filter(
    (l) =>
      !search ||
      (l.recipient ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (l.template_key ?? "").toLowerCase().includes(search.toLowerCase()) ||
      (l.booking_id ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  const sentCount = logs.filter((l) => l.status === "sent").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Notification Logs</h1>
          <p className="mt-0.5 text-sm text-slate-500">Track delivered and failed notifications across all channels.</p>
        </div>
        <button
          type="button"
          onClick={() => void refetch()}
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50 shadow-sm"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">Retry</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total",   value: loading ? "—" : logs.length,    color: "text-slate-800" },
          { label: "Sent",    value: loading ? "—" : sentCount,      color: "text-emerald-600" },
          { label: "Failed",  value: loading ? "—" : failedCount,    color: failedCount > 0 ? "text-red-600" : "text-slate-400" },
          { label: "Success %",
            value: loading || logs.length === 0 ? "—" : `${Math.round((sentCount / logs.length) * 100)}%`,
            color: "text-blue-600" },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k.label}</p>
            <p className={cn("mt-1 text-2xl font-bold tabular-nums", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-white border border-slate-100 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by recipient, template, booking…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-4 text-sm placeholder:text-slate-400 focus:outline-none focus:border-blue-300"
            />
          </div>
          <div className="flex gap-1">
            {(["all", "email", "whatsapp", "sms"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannelFilter(c)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors capitalize",
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
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors capitalize",
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
                {["Time", "Channel", "Recipient", "Template", "Booking", "Status"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={6} className="px-4 py-3">
                      <div className="h-5 animate-pulse rounded-lg bg-slate-100" />
                    </td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-sm text-slate-400">
                    No notification logs found.
                  </td>
                </tr>
              ) : (
                filtered.map((l) => {
                  const CIcon = CHANNEL_ICONS[l.channel ?? ""] ?? Bell;
                  return (
                    <tr key={l.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">
                        {formatDate(l.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <CIcon className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-xs font-semibold capitalize text-slate-700">
                            {l.channel ?? "—"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-[160px] truncate">
                        {l.recipient ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 max-w-[160px] truncate">
                        {l.template_key ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs font-mono text-blue-600">
                        {l.booking_id ? l.booking_id.slice(0, 8).toUpperCase() : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {l.status === "sent" ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-red-500" />
                          )}
                          <span
                            className={cn(
                              "text-xs font-semibold",
                              l.status === "sent" ? "text-emerald-600" : "text-red-600",
                            )}
                          >
                            {l.status === "sent" ? "Sent" : "Failed"}
                          </span>
                        </div>
                        {l.error && (
                          <p className="mt-0.5 text-[10px] text-red-400 truncate max-w-[120px]" title={l.error}>
                            {l.error}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <p className="text-xs text-slate-400">
            {loading ? "Loading…" : `${filtered.length} of ${logs.length} logs`}
          </p>
        </div>
      </div>
    </div>
  );
}
