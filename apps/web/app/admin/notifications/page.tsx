"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { extractBookingIdFromLogContext } from "@/lib/booking/bookingIds";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type FlapSeverityLevel = "critical" | "error" | "warn" | "info";

type MonitoringPayload = {
  days: number;
  health: "healthy" | "degraded" | "critical";
  derived: {
    whatsappSuccessRate: number | null;
    whatsappErrorRate: number | null;
    smsFallbackRate: number | null;
    emailSuccessRate: number | null;
    emailErrorRate: number | null;
    whatsappTotal: number;
    smsTotal: number;
    emailTotal: number;
    slowNotificationCount: number;
  };
  lastWhatsappFailureAt: string | null;
  lastEmailFailureAt: string | null;
  daily: Array<{ day: string; source: string; cnt: number }>;
  dailyError: string | null;
  recent: Array<{
    id: string;
    createdAt: string;
    bookingId: string | null;
    channel: string;
    result: string;
    latencyMs: number | null;
    source: string;
    message: string;
  }>;
  recentError: string | null;
  alertHistory: Array<{
    id: string;
    type: string;
    severity: string;
    firstFiredAt: string;
    firedAt: string;
    resolvedAt: string | null;
    context: Record<string, unknown>;
    occurrenceCount: number;
    durationMs: number;
    isFlapping: boolean;
    flapCount: number;
    flapSeverity: FlapSeverityLevel;
    flapRatePerHour: number | null;
  }>;
  alertHistoryError: string | null;
  alerts: {
    autoResolved?: number;
    minSample: number;
    whatsappSuccessAlertBelowPct: number;
    emailErrorAlertAbovePct: number;
    slowAlertMinCount: number;
    cooldownMinutes: number;
  };
  error?: string;
};

type TimelineEntry = {
  id: string;
  at: string;
  label: string;
  source: string;
  level: string;
  detail: string;
  status: "success" | "fallback" | "failed" | "info";
};

function fmtPct(v: number | null): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v}%`;
}

function fmtIso(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function fmtClock(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false });
  } catch {
    return iso;
  }
}

function fmtShortDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function resultBadgeClass(result: string): string {
  if (result === "failed") return "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-100";
  if (result === "slow") return "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-100";
  if (result === "ok") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-100";
  return "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200";
}

function healthBannerClass(h: MonitoringPayload["health"]): string {
  if (h === "healthy")
    return "border-emerald-200 bg-emerald-50/90 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-50";
  if (h === "degraded")
    return "border-amber-200 bg-amber-50/90 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-50";
  return "border-rose-200 bg-rose-50/90 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/35 dark:text-rose-50";
}

function healthLabel(h: MonitoringPayload["health"]): string {
  if (h === "healthy") return "Healthy";
  if (h === "degraded") return "Degraded";
  return "Critical";
}

function healthEmoji(h: MonitoringPayload["health"]): string {
  if (h === "healthy") return "🟢";
  if (h === "degraded") return "🟡";
  return "🔴";
}

function fmtDurationMs(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return "<1 sec";
  const sec = Math.round(ms / 1000);
  if (sec < 120) return `${sec} sec`;
  const min = Math.round(ms / 60_000);
  if (min < 120) return `${min} min`;
  const hr = Math.round(ms / 3_600_000);
  return `${hr} hr`;
}

function flapEscalationLabel(sev: FlapSeverityLevel): string {
  if (sev === "critical") return "Critical";
  if (sev === "error") return "Unstable";
  if (sev === "warn") return "Elevated";
  return "";
}

function flapEscalationClass(sev: FlapSeverityLevel): string {
  if (sev === "critical")
    return "border-rose-300 bg-rose-100 text-rose-950 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-50";
  if (sev === "error")
    return "border-orange-300 bg-orange-100 text-orange-950 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-50";
  if (sev === "warn")
    return "border-amber-300 bg-amber-100 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-50";
  return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/40 dark:text-amber-100";
}

function timelineStatusMark(status: TimelineEntry["status"]): string {
  if (status === "success") return "✅";
  if (status === "fallback") return "⚠️";
  if (status === "failed") return "❌";
  return "·";
}

type TimelineFilter = "all" | "failures" | "cleaner";

function filterTimelineEntries(entries: TimelineEntry[], filter: TimelineFilter): TimelineEntry[] {
  if (filter === "all") return entries;
  if (filter === "failures") {
    return entries.filter(
      (e) =>
        e.status === "failed" ||
        e.source === "slow_notification" ||
        e.source.endsWith("_failed") ||
        e.source === "missing_customer_email",
    );
  }
  return entries.filter(
    (e) =>
      e.source.startsWith("cleaner_") ||
      e.source === "sms_fallback_sent" ||
      e.source === "sms_fallback_disabled" ||
      e.source === "sms_fallback_invalid_to" ||
      e.source === "assigned_sent" ||
      e.source === "reminder_2h_sent" ||
      e.source === "notifyBookingEvent/assigned",
  );
}

export default function AdminNotificationsMonitoringPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<MonitoringPayload | null>(null);
  const [days, setDays] = useState(7);
  const [timelineOpen, setTimelineOpen] = useState(false);
  const [timelineBookingId, setTimelineBookingId] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState<TimelineEntry[]>([]);
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>("all");
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [timelineUnstable, setTimelineUnstable] = useState(false);
  const [timelineFlappingHint, setTimelineFlappingHint] = useState(false);
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const filteredTimelineEntries = useMemo(
    () => filterTimelineEntries(timelineEntries, timelineFilter),
    [timelineEntries, timelineFilter],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setError("Please sign in as admin.");
      setPayload(null);
      setLoading(false);
      return;
    }
    const res = await fetch(`/api/admin/notification-monitoring?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as MonitoringPayload & { error?: string };
    if (!res.ok) {
      setError(json.error ?? "Failed to load notification metrics.");
      setPayload(null);
    } else {
      setError(null);
      setPayload(json);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => {
    void load();
  }, [load]);

  const openTimeline = useCallback(async (bookingId: string, opts?: { flappingHint?: boolean }) => {
    setTimelineBookingId(bookingId);
    setTimelineFilter("all");
    setTimelineOpen(true);
    setTimelineLoading(true);
    setTimelineError(null);
    setTimelineEntries([]);
    setTimelineUnstable(false);
    setTimelineFlappingHint(Boolean(opts?.flappingHint));
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setTimelineError("Not signed in.");
      setTimelineLoading(false);
      return;
    }
    const res = await fetch(`/api/admin/booking-notification-timeline?bookingId=${encodeURIComponent(bookingId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as { entries?: TimelineEntry[]; unstable?: boolean; error?: string };
    if (!res.ok) {
      setTimelineError(json.error ?? "Could not load timeline.");
      setTimelineEntries([]);
      setTimelineUnstable(false);
    } else {
      setTimelineEntries(json.entries ?? []);
      setTimelineUnstable(Boolean(json.unstable));
    }
    setTimelineLoading(false);
  }, []);

  const exportMetricsCsv = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    const res = await fetch(`/api/admin/export-notification-metrics?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `notification-metrics-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }, [days]);

  const exportAlertsCsv = useCallback(async () => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) return;
    const res = await fetch("/api/admin/export-notifications", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `notification-alerts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(href);
  }, []);

  const resolveAlert = useCallback(
    async (alertId: string) => {
      setResolvingId(alertId);
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        setResolvingId(null);
        return;
      }
      const res = await fetch(`/api/admin/notification-alerts/${alertId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ resolved: true }),
      });
      setResolvingId(null);
      if (res.ok) void load();
    },
    [load],
  );

  const chartSeries = useMemo(() => {
    const rows = payload?.daily ?? [];
    const byDay = new Map<string, number>();
    for (const r of rows) {
      byDay.set(r.day, (byDay.get(r.day) ?? 0) + (Number.isFinite(r.cnt) ? r.cnt : 0));
    }
    const sorted = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const max = sorted.reduce((m, [, c]) => Math.max(m, c), 1);
    return sorted.map(([day, cnt]) => ({ day, cnt, h: Math.round((cnt / max) * 100) }));
  }, [payload?.daily]);

  const d = payload?.derived;
  const th = payload?.alerts;
  const health = payload?.health ?? "healthy";

  const alertItems = useMemo(() => {
    if (!d || !th) return [];
    const items: { level: "warn" | "bad" | "ok"; text: string }[] = [];
    if (
      d.whatsappTotal >= th.minSample &&
      d.whatsappSuccessRate != null &&
      d.whatsappSuccessRate < th.whatsappSuccessAlertBelowPct
    ) {
      items.push({
        level: "bad",
        text: `WhatsApp success ${d.whatsappSuccessRate}% is below ${th.whatsappSuccessAlertBelowPct}% (sample ${d.whatsappTotal}).`,
      });
    }
    if (
      d.emailTotal >= th.minSample &&
      d.emailErrorRate != null &&
      d.emailErrorRate > th.emailErrorAlertAbovePct
    ) {
      items.push({
        level: "bad",
        text: `Email error rate ${d.emailErrorRate}% exceeds ${th.emailErrorAlertAbovePct}% (sample ${d.emailTotal}).`,
      });
    }
    if (d.slowNotificationCount >= th.slowAlertMinCount) {
      items.push({
        level: "warn",
        text: `${d.slowNotificationCount} slow pipeline events (≥ ${th.slowAlertMinCount}).`,
      });
    }
    if (items.length === 0) {
      items.push({ level: "ok", text: "No threshold breaches on this window (see env for alert rules)." });
    }
    return items;
  }, [d, th]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Notification monitoring</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Delivery health from <span className="font-mono text-xs">system_logs</span> (WhatsApp, SMS fallback, email,
          slow pipeline). Alerts fire only with <span className="font-mono text-xs">?alerts=1</span> or{" "}
          <span className="font-mono text-xs">NOTIFICATION_METRICS_ALERTS=true</span>.
        </p>
        <p className="mt-2 text-xs text-zinc-500">
          <Link href="/admin" className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
            ← Admin home
          </Link>
        </p>
        <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
          Roadmap: provider-level splits (e.g. Twilio WhatsApp vs SMS vs Resend email) for pinpointing third-party
          failures.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
          Window
          <select
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[7, 14, 30].map((n) => (
              <option key={n} value={n}>
                {n} days
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-md border border-zinc-300 bg-zinc-50 px-3 py-1 text-sm font-medium text-zinc-800 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100 dark:hover:bg-zinc-700"
        >
          Refresh
        </button>
        <button
          type="button"
          onClick={() => void exportAlertsCsv()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Export alerts (CSV)
        </button>
        <button
          type="button"
          onClick={() => void exportMetricsCsv()}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1 text-sm font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
        >
          Export metrics (CSV)
        </button>
      </div>

      {!loading && !error && payload ? (
        <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${healthBannerClass(health)}`}>
          <span className="mr-2">{healthEmoji(health)}</span>
          System health: {healthLabel(health)} — WhatsApp success, email errors, and slow pipeline counts vs
          configured thresholds.
          {(payload.alerts?.autoResolved ?? 0) > 0 ? (
            <span className="mt-2 block text-xs font-normal opacity-90">
              Last refresh auto-resolved {payload.alerts.autoResolved} open alert(s) (metrics recovered).
            </span>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : d && th ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>WhatsApp success</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{fmtPct(d.whatsappSuccessRate)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">Events: {d.whatsappTotal}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>WhatsApp error</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{fmtPct(d.whatsappErrorRate)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">Last fail: {fmtIso(payload?.lastWhatsappFailureAt ?? null)}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>SMS fallback (of WA attempts)</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{fmtPct(d.smsFallbackRate)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">SMS rows: {d.smsTotal}</CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Email error</CardDescription>
                <CardTitle className="text-2xl tabular-nums">{fmtPct(d.emailErrorRate)}</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-zinc-500">
                Email vol: {d.emailTotal} · Last fail: {fmtIso(payload?.lastEmailFailureAt ?? null)}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Notifications per day</CardTitle>
                <CardDescription>Total log volume (all monitored sources), UTC day.</CardDescription>
              </CardHeader>
              <CardContent>
                {payload?.dailyError ? (
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    Daily series unavailable ({payload.dailyError}). Apply migration{" "}
                    <span className="font-mono">notification_system_logs_daily</span>.
                  </p>
                ) : chartSeries.length === 0 ? (
                  <p className="text-sm text-zinc-500">No rows in this window.</p>
                ) : (
                  <div className="flex h-40 items-end gap-2 border-b border-zinc-200 pb-1 dark:border-zinc-700">
                    {chartSeries.map(({ day, cnt, h }) => (
                      <div key={day} className="flex flex-1 flex-col items-center gap-1">
                        <span className="text-[10px] font-medium text-zinc-500">{cnt}</span>
                        <div
                          className="w-full max-w-[48px] rounded-t bg-blue-500/80 dark:bg-blue-400/70"
                          style={{ height: `${Math.max(8, h)}%` }}
                          title={`${day}: ${cnt}`}
                        />
                        <span className="mt-1 truncate text-[10px] text-zinc-500" title={day}>
                          {day.slice(5)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Alert panel</CardTitle>
                <CardDescription>
                  Thresholds: WA success &lt; {th.whatsappSuccessAlertBelowPct}%, email error &gt;{" "}
                  {th.emailErrorAlertAbovePct}%, slow ≥ {th.slowAlertMinCount}. Cooldown {th.cooldownMinutes}m between
                  fires.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {alertItems.map((a, i) => (
                  <p
                    key={i}
                    className={
                      a.level === "ok"
                        ? "rounded-lg border border-emerald-200 bg-emerald-50/80 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100"
                        : a.level === "bad"
                          ? "rounded-lg border border-rose-200 bg-rose-50/80 px-3 py-2 text-sm text-rose-900 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100"
                          : "rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100"
                    }
                  >
                    {a.text}
                  </p>
                ))}
                <p className="text-xs text-zinc-500">
                  Slow events logged: <span className="font-semibold">{d.slowNotificationCount}</span>
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Alert history</CardTitle>
              <CardDescription>
                Rows in <span className="font-mono text-xs">notification_alerts</span> when metric alerts fire (audit +
                trends). Open rows with the same type bump <span className="font-mono text-xs">occurrence_count</span>{" "}
                instead of duplicating. <span className="font-mono text-xs">first_fired_at</span> is incident start;{" "}
                <span className="font-mono text-xs">fired_at</span> is last recurrence. Flapping = reopened soon after a
                resolve. Sorted: flapping first, then longest span, then most recent. Auto-resolve when alerts are
                enabled and metrics recover.
              </CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {payload?.alertHistoryError ? (
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Alert history unavailable ({payload.alertHistoryError}). Apply migration{" "}
                  <span className="font-mono">notification_alerts</span>.
                </p>
              ) : (payload?.alertHistory ?? []).length === 0 ? (
                <p className="text-sm text-zinc-500">No stored alerts yet.</p>
              ) : (
                <table className="w-full min-w-[960px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-700">
                      <th className="py-2 pr-3">Activity window</th>
                      <th className="py-2 pr-3">Type</th>
                      <th className="py-2 pr-3">Severity</th>
                      <th className="py-2 pr-3">Flap</th>
                      <th className="py-2 pr-3 text-right tabular-nums">Count</th>
                      <th className="py-2 pr-3 text-right tabular-nums">Duration</th>
                      <th className="py-2 pr-3">Resolved</th>
                      <th className="py-2 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload?.alertHistory ?? []).map((a) => {
                      const alertBookingId = extractBookingIdFromLogContext(a.context);
                      return (
                      <tr key={a.id} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td className="py-2 pr-3 text-zinc-700 dark:text-zinc-300">
                          <div className="text-[11px] leading-snug">
                            <div>
                              <span className="font-medium text-zinc-500 dark:text-zinc-400">Started</span>{" "}
                              <span className="tabular-nums">{fmtClock(a.firstFiredAt ?? a.firedAt)}</span>
                              <span className="text-zinc-400"> · {fmtShortDate(a.firstFiredAt ?? a.firedAt)}</span>
                            </div>
                            <div>
                              <span className="font-medium text-zinc-500 dark:text-zinc-400">Last seen</span>{" "}
                              <span className="tabular-nums">{fmtClock(a.firedAt)}</span>
                              <span className="text-zinc-400"> · {fmtShortDate(a.firedAt)}</span>
                            </div>
                          </div>
                        </td>
                        <td className="py-2 pr-3 font-mono text-xs">{a.type}</td>
                        <td className="py-2 pr-3 capitalize">{a.severity}</td>
                        <td className="py-2 pr-3 text-xs">
                          {a.isFlapping ? (
                            <span
                              className={`inline-flex max-w-[220px] flex-col gap-0.5 rounded border px-1.5 py-1 font-medium ${flapEscalationClass(a.flapSeverity)}`}
                            >
                              <span className="whitespace-nowrap">
                                {a.flapSeverity === "critical"
                                  ? "🔴 "
                                  : a.flapSeverity === "error"
                                    ? "🟠 "
                                    : a.flapSeverity === "warn"
                                      ? "🟡 "
                                      : ""}
                                {(a.flapCount ?? 0) > 1 ? `Flapping (${a.flapCount}×)` : "Flapping"}
                                {flapEscalationLabel(a.flapSeverity) ? ` — ${flapEscalationLabel(a.flapSeverity)}` : ""}
                              </span>
                              {a.isFlapping && a.flapRatePerHour != null && Number.isFinite(a.flapRatePerHour) ? (
                                <span className="block text-[10px] font-normal opacity-90">
                                  {a.flapRatePerHour.toFixed(1)} flaps/hr
                                </span>
                              ) : null}
                            </span>
                          ) : (
                            <span className="text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">{a.occurrenceCount ?? 1}</td>
                        <td className="py-2 pr-3 text-right tabular-nums text-zinc-600 dark:text-zinc-400">
                          {fmtDurationMs(a.durationMs ?? 0)}
                          {!a.resolvedAt ? (
                            <span className="ml-1 text-[10px] font-normal uppercase text-zinc-400">ongoing</span>
                          ) : null}
                        </td>
                        <td className="py-2 pr-3 text-zinc-600 dark:text-zinc-400">
                          {a.resolvedAt ? fmtIso(a.resolvedAt) : "—"}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {alertBookingId ? (
                              <button
                                type="button"
                                onClick={() => void openTimeline(alertBookingId, { flappingHint: a.isFlapping })}
                                className={
                                  a.isFlapping
                                    ? "rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-950 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-50 dark:hover:bg-amber-900/60"
                                    : "rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                                }
                              >
                                Timeline
                              </button>
                            ) : null}
                            {!a.resolvedAt ? (
                              <button
                                type="button"
                                disabled={resolvingId === a.id}
                                onClick={() => void resolveAlert(a.id)}
                                className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-800 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                              >
                                {resolvingId === a.id ? "…" : "Resolve"}
                              </button>
                            ) : (
                              <span className="text-xs text-zinc-400">Done</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent events</CardTitle>
              <CardDescription>Latest notification-related logs in the selected window.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {payload?.recentError ? (
                <p className="text-sm text-rose-600">{payload.recentError}</p>
              ) : (
                <table className="w-full min-w-[720px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 text-xs uppercase text-zinc-500 dark:border-zinc-700">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Booking</th>
                      <th className="py-2 pr-3">Channel</th>
                      <th className="py-2 pr-3">Result</th>
                      <th className="py-2 pr-3">Latency</th>
                      <th className="py-2">Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(payload?.recent ?? []).map((r) => (
                      <tr key={r.id} className="border-b border-zinc-100 dark:border-zinc-800">
                        <td className="py-2 pr-3 whitespace-nowrap text-zinc-600 dark:text-zinc-400">
                          {fmtIso(r.createdAt)}
                        </td>
                        <td className="py-2 pr-3">
                          {r.bookingId ? (
                            <div className="flex flex-wrap items-center gap-2">
                              <Link
                                href={`/admin/bookings?q=${encodeURIComponent(r.bookingId)}`}
                                className="font-mono text-xs text-blue-600 hover:underline dark:text-blue-400"
                              >
                                {r.bookingId.slice(0, 8)}…
                              </Link>
                              <button
                                type="button"
                                onClick={() => void openTimeline(r.bookingId!)}
                                className="rounded border border-zinc-300 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                              >
                                Timeline
                              </button>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-2 pr-3 capitalize">{r.channel}</td>
                        <td className="py-2 pr-3">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${resultBadgeClass(r.result)}`}>
                            {r.result}
                          </span>
                        </td>
                        <td className="py-2 pr-3 tabular-nums">
                          {r.latencyMs != null && Number.isFinite(r.latencyMs) ? `${Math.round(r.latencyMs)} ms` : "—"}
                        </td>
                        <td className="py-2 font-mono text-xs text-zinc-600 dark:text-zinc-400">{r.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      <Dialog
        open={timelineOpen}
        onOpenChange={(open) => {
          setTimelineOpen(open);
          if (!open) {
            setTimelineBookingId(null);
            setTimelineEntries([]);
            setTimelineError(null);
            setTimelineFilter("all");
            setTimelineUnstable(false);
            setTimelineFlappingHint(false);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Notification timeline</DialogTitle>
            <DialogDescription>
              {timelineBookingId ? (
                <>
                  Booking{" "}
                  <span className="font-mono text-xs">{timelineBookingId}</span> — chronological delivery logs.
                </>
              ) : (
                "Select a booking from recent events."
              )}
            </DialogDescription>
          </DialogHeader>
          {!timelineLoading && !timelineError && (timelineUnstable || timelineFlappingHint) && timelineEntries.length > 0 ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-50">
              <span className="font-medium">Unstable notifications detected</span>
              <span className="mt-1 block text-xs font-normal opacity-90">
                {timelineFlappingHint
                  ? "A notification alert for this booking is flapping (reopened soon after resolve). "
                  : ""}
                {timelineUnstable
                  ? "The delivery timeline shows clustered failures or fallbacks (heuristic). Use filters to isolate channels."
                  : timelineFlappingHint
                    ? "Review events below and resolve the underlying alert when metrics recover."
                    : ""}
              </span>
            </div>
          ) : null}
          {!timelineLoading && !timelineError && timelineEntries.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: "all" as const, label: "All" },
                  { id: "failures" as const, label: "Failures only" },
                  { id: "cleaner" as const, label: "Cleaner only" },
                ] as const
              ).map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setTimelineFilter(b.id)}
                  className={
                    timelineFilter === b.id
                      ? "rounded-full border border-blue-600 bg-blue-600 px-3 py-1 text-xs font-medium text-white dark:border-blue-500 dark:bg-blue-600"
                      : "rounded-full border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  }
                >
                  {b.label}
                </button>
              ))}
            </div>
          ) : null}
          {timelineLoading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : timelineError ? (
            <p className="text-sm text-rose-600">{timelineError}</p>
          ) : timelineEntries.length === 0 ? (
            <p className="text-sm text-zinc-500">No matching notification logs for this booking.</p>
          ) : filteredTimelineEntries.length === 0 ? (
            <p className="text-sm text-zinc-500">No entries for this filter.</p>
          ) : (
            <div className="space-y-3">
              {filteredTimelineEntries.map((e) => (
                <div
                  key={e.id}
                  className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-950/40"
                >
                  <p className="font-medium text-zinc-900 dark:text-zinc-50">
                    <span className="mr-2" title={e.status}>
                      {timelineStatusMark(e.status)}
                    </span>
                    {e.label}
                  </p>
                  <p className="text-xs text-zinc-500">
                    {fmtIso(e.at)} · <span className="font-mono">{e.source}</span>
                    {e.level ? ` · ${e.level}` : ""}
                  </p>
                  {e.detail ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{e.detail}</p> : null}
                </div>
              ))}
            </div>
          )}
          <DialogFooter className="sm:justify-between">
            {timelineBookingId ? (
              <Link
                href={`/admin/bookings?q=${encodeURIComponent(timelineBookingId)}`}
                className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                Open in bookings
              </Link>
            ) : (
              <span />
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}
