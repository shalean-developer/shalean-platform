"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { AttentionRequiredPanel } from "@/components/admin/AttentionRequiredPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type FailureBucketEntry = { count: number; pctOfFailed: number | null };

type NotificationsToday = {
  windowStartIso: string;
  email: { sent: number; failed: number };
  whatsapp: { sent: number; failed: number };
  sms: { sent: number; failed: number };
  whatsappSuccessRatePct: number | null;
  cleanerSmsDirectSent: number;
  whatsappPausedUntilIso?: string | null;
  /** WhatsApp circuit paused + elevated SMS + email failures (same JHB-day window). */
  allChannelsDegraded?: boolean;
  providerHealth?: {
    whatsapp: {
      totalAttempts: number;
      successRatePct: number | null;
      failureBreakdown: Record<string, FailureBucketEntry>;
    };
    sms: { failed: number; failureBreakdown: Record<string, FailureBucketEntry> };
  };
  /** Counts by `payload.decision` (customer routing), same JHB-day window. */
  decisionBreakdown?: Record<string, number>;
  decisionPerformance?: Record<string, { total: number; success: number; rate: number | null }>;
  notificationCostTodayUsd?: {
    total: number;
    byChannel: { email: number; whatsapp: number; sms: number };
    costPerSuccessByChannel?: { email: number | null; whatsapp: number | null; sms: number | null };
    totalCostPerSuccess?: number | null;
    currency: string;
  };
  topFailingContacts?: {
    phoneKey: string;
    successRate: number;
    sampleSize: number;
    lastUpdated: string | null;
  }[];
};

function formatBucketLabel(key: string): string {
  return key.replace(/_/g, " ");
}

function formatMoney(n: number | null | undefined): string {
  return typeof n === "number" && Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}

function maskPhoneKey(phoneKey: string): string {
  const key = phoneKey.startsWith("digits:") ? phoneKey.slice(7) : phoneKey;
  const digits = key.replace(/\D/g, "");
  if (digits.length < 7) return phoneKey;
  const prefix = phoneKey.startsWith("+") ? "+" : "";
  return `${prefix}${digits.slice(0, 4)} ${"X".repeat(Math.max(3, digits.length - 7))} ${digits.slice(-3)}`;
}

function NotificationDeliverySummaryCard({ n }: { n: NotificationsToday }) {
  const waT = n.whatsapp.sent + n.whatsapp.failed;
  const ph = n.providerHealth;
  const waBuckets = ph?.whatsapp.failureBreakdown
    ? Object.entries(ph.whatsapp.failureBreakdown).filter(([, v]) => v.count > 0)
    : [];
  const smsBuckets = ph?.sms.failureBreakdown
    ? Object.entries(ph.sms.failureBreakdown).filter(([, v]) => v.count > 0)
    : [];
  const decisionPerf = n.decisionPerformance
    ? Object.entries(n.decisionPerformance).filter(([, v]) => v.total > 0)
    : [];
  return (
    <Card className="sm:col-span-2 lg:col-span-4">
      <CardHeader className="pb-2">
        <CardDescription>Notifications today (Johannesburg day)</CardDescription>
        <CardTitle className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Email {n.email.sent} sent
          {n.email.failed > 0 ? (
            <span className="text-rose-600 dark:text-rose-400"> · {n.email.failed} failed</span>
          ) : null}
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">|</span>
          WhatsApp {n.whatsapp.sent}/{waT || 0} ok
          {n.whatsappSuccessRatePct != null ? (
            <span className="text-zinc-500"> ({n.whatsappSuccessRatePct}%)</span>
          ) : null}
          <span className="mx-2 text-zinc-300 dark:text-zinc-600">|</span>
          SMS {n.sms.sent} sent
          {n.sms.failed > 0 ? (
            <span className="text-rose-600 dark:text-rose-400"> · {n.sms.failed} failed</span>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-zinc-600 dark:text-zinc-400">
        {n.whatsappPausedUntilIso ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-100">
            <span className="font-semibold">WhatsApp paused</span> until{" "}
            <span className="font-mono text-xs">{n.whatsappPausedUntilIso}</span> (UTC) — new sends skip Meta and use SMS
            fallback where configured.
          </p>
        ) : null}
        <p>
          Cleaner SMS sends (direct templates):{" "}
          <span className="font-medium text-zinc-800 dark:text-zinc-200">{n.cleanerSmsDirectSent}</span>. A spike here
          alongside WhatsApp failures often indicates fallback load.{" "}
          <Link href="/admin/notification-logs" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Open logs
          </Link>
          .
        </p>
        {n.decisionBreakdown && Object.keys(n.decisionBreakdown).length > 0 ? (
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Routing decisions (payload.decision)
            </p>
            <ul className="grid max-h-40 gap-1 overflow-y-auto text-xs sm:grid-cols-2">
              {Object.entries(n.decisionBreakdown)
                .filter(([, c]) => c > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([key, count]) => (
                  <li key={key} className="flex justify-between gap-2 rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-900/50">
                    <span className="truncate font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{key}</span>
                    <span className="shrink-0 font-mono text-zinc-600 dark:text-zinc-400">{count}</span>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {decisionPerf.length > 0 ? (
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Decision success rate
            </p>
            <ul className="grid max-h-48 gap-1 overflow-y-auto text-xs sm:grid-cols-2">
              {decisionPerf
                .sort((a, b) => b[1].total - a[1].total)
                .map(([key, v]) => (
                  <li key={key} className="rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-900/50">
                    <div className="flex justify-between gap-2">
                      <span className="truncate font-mono text-[11px] text-zinc-700 dark:text-zinc-300">{key}</span>
                      <span className="shrink-0 font-mono text-zinc-600 dark:text-zinc-400">
                        {v.success}/{v.total}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-1.5 rounded-full bg-emerald-500"
                        style={{ width: `${Math.max(0, Math.min(100, (v.rate ?? 0) * 100))}%` }}
                      />
                    </div>
                    <p className="mt-1 text-right font-mono text-[11px] text-zinc-500">
                      {v.rate != null ? `${Math.round(v.rate * 1000) / 10}%` : "—"}
                    </p>
                  </li>
                ))}
            </ul>
          </div>
        ) : null}
        {n.notificationCostTodayUsd ? (
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Estimated send cost today ({n.notificationCostTodayUsd.currency})
            </p>
            <ul className="space-y-1 text-xs">
              <li className="flex justify-between gap-2">
                <span>Email</span>
                <span className="font-mono">${n.notificationCostTodayUsd.byChannel.email.toFixed(2)}</span>
              </li>
              <li className="flex justify-between gap-2 pl-3 text-[11px] text-zinc-500">
                <span>Email cost / success</span>
                <span className="font-mono">{formatMoney(n.notificationCostTodayUsd.costPerSuccessByChannel?.email)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>WhatsApp</span>
                <span className="font-mono">${n.notificationCostTodayUsd.byChannel.whatsapp.toFixed(2)}</span>
              </li>
              <li className="flex justify-between gap-2 pl-3 text-[11px] text-zinc-500">
                <span>WhatsApp cost / success</span>
                <span className="font-mono">{formatMoney(n.notificationCostTodayUsd.costPerSuccessByChannel?.whatsapp)}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span>SMS</span>
                <span className="font-mono">${n.notificationCostTodayUsd.byChannel.sms.toFixed(2)}</span>
              </li>
              <li className="flex justify-between gap-2 pl-3 text-[11px] text-zinc-500">
                <span>SMS cost / success</span>
                <span className="font-mono">{formatMoney(n.notificationCostTodayUsd.costPerSuccessByChannel?.sms)}</span>
              </li>
              <li className="flex justify-between gap-2 border-t border-zinc-200 pt-1 font-medium text-zinc-800 dark:border-zinc-600 dark:text-zinc-200">
                <span>Total</span>
                <span className="font-mono">${n.notificationCostTodayUsd.total.toFixed(2)}</span>
              </li>
              <li className="flex justify-between gap-2 text-[11px] font-medium text-zinc-600 dark:text-zinc-300">
                <span>Total cost / success</span>
                <span className="font-mono">{formatMoney(n.notificationCostTodayUsd.totalCostPerSuccess)}</span>
              </li>
            </ul>
            <p className="mt-2 text-[11px] text-zinc-500">
              Marginal estimates from log payloads — tune with <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">NOTIFICATION_COST_*_USD</code>.
            </p>
          </div>
        ) : null}
        {n.topFailingContacts && n.topFailingContacts.length > 0 ? (
          <div className="border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              Top failing contacts
            </p>
            <ul className="space-y-1 text-xs">
              {n.topFailingContacts.map((c) => (
                <li key={c.phoneKey} className="flex justify-between gap-3 rounded bg-zinc-50 px-2 py-1 dark:bg-zinc-900/50">
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">{maskPhoneKey(c.phoneKey)}</span>
                  <span className="shrink-0 font-mono text-zinc-600 dark:text-zinc-400">
                    {Math.round(c.successRate * 1000) / 10}% success · n={c.sampleSize}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {ph && (waBuckets.length > 0 || smsBuckets.length > 0) ? (
          <div className="grid gap-4 border-t border-zinc-200 pt-4 dark:border-zinc-700 sm:grid-cols-2">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">WhatsApp fail mix</p>
              <p className="mb-2 text-xs text-zinc-500">
                % of failed WhatsApp only — success uses Meta HTTP 200 + message <code className="text-[11px]">id</code>{" "}
                (Graph errors fail closed).
              </p>
              {waBuckets.length === 0 ? (
                <p className="text-xs text-zinc-500">No failures in window.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {waBuckets.map(([key, v]) => (
                    <li key={key} className="flex justify-between gap-2">
                      <span className="text-zinc-700 dark:text-zinc-300">{formatBucketLabel(key)}</span>
                      <span className="shrink-0 font-mono text-zinc-600 dark:text-zinc-400">
                        {v.count}
                        {v.pctOfFailed != null ? ` (${v.pctOfFailed}% of fails)` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">SMS fail mix (Twilio)</p>
              {smsBuckets.length === 0 ? (
                <p className="text-xs text-zinc-500">No SMS failures in window.</p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {smsBuckets.map(([key, v]) => (
                    <li key={key} className="flex justify-between gap-2">
                      <span className="text-zinc-700 dark:text-zinc-300">{formatBucketLabel(key)}</span>
                      <span className="shrink-0 font-mono text-zinc-600 dark:text-zinc-400">
                        {v.count}
                        {v.pctOfFailed != null ? ` (${v.pctOfFailed}% of fails)` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

type DashboardStats = {
  revenueTodayZar: number;
  revenueMonthZar: number;
  paidBookingsToday: number;
  paidBookingsMonth: number;
  totalBookingsWindow: number;
  avgBookingValueZar: number;
  conversionRatePct: number;
  funnelSessionsQuote: number;
  funnelSessionsPayment: number;
  notificationsToday?: NotificationsToday;
  error?: string;
};

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Please sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/dashboard-stats", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const json = (await res.json()) as DashboardStats & { error?: string };
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load dashboard.");
        setData(null);
      } else {
        setError(null);
        setData(json);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <AttentionRequiredPanel />
      {data?.notificationsToday?.allChannelsDegraded ? (
        <div
          role="alert"
          className="rounded-xl border-2 border-red-700 bg-red-950 px-4 py-3 text-sm text-red-50 shadow-md dark:border-red-500 dark:bg-red-950/90"
        >
          <p className="font-semibold tracking-tight">Critical: outbound notifications degraded</p>
          <p className="mt-1 text-red-100/95">
            WhatsApp is paused, and both SMS and email are showing elevated failures today. Check Meta, Twilio, and
            Resend — see delivery logs and <code className="rounded bg-red-900/80 px-1 text-xs">system_logs</code> source{" "}
            <code className="rounded bg-red-900/80 px-1 text-xs">notification_critical_escalation</code>.
          </p>
        </div>
      ) : null}
      <div>
        <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Overview</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Revenue and bookings from Supabase. Conversion uses <span className="font-medium">booking_events</span> (quote
          views → checkout) over the last 30 days.
        </p>
        <p className="mt-3 text-xs text-zinc-500">
          <Link href="/admin/ops/sla-breaches" className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
            SLA breach queue
          </Link>
          {" · "}
          <Link
            href="/admin/notifications"
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            Notification monitoring
          </Link>
          {" · "}
          <Link
            href="/admin/notification-logs"
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            Delivery logs
          </Link>
          {" · "}
          <Link
            href="/admin/ops/cleaner-performance"
            className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
          >
            Cleaner performance
          </Link>
          {" · "}
          <Link href="/admin/operations" className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
            Operations analytics
          </Link>{" "}
          (dispatch, supply, legacy funnel).
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Revenue today</CardDescription>
              <CardTitle className="text-2xl tabular-nums">R {data.revenueTodayZar.toLocaleString("en-ZA")}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">Paid bookings today: {data.paidBookingsToday}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Revenue this month</CardDescription>
              <CardTitle className="text-2xl tabular-nums">R {data.revenueMonthZar.toLocaleString("en-ZA")}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">Paid bookings (MTD): {data.paidBookingsMonth}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Bookings (30d window)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.totalBookingsWindow}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">All rows in rolling window from API query</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Avg booking value</CardDescription>
              <CardTitle className="text-2xl tabular-nums">R {data.avgBookingValueZar.toLocaleString("en-ZA")}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-zinc-500">Among paid bookings in window</CardContent>
          </Card>
          <Card className="sm:col-span-2 lg:col-span-4">
            <CardHeader className="pb-2">
              <CardDescription>Conversion rate</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{data.conversionRatePct}%</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-zinc-600 dark:text-zinc-400">
              Sessions that viewed <strong>quote</strong> vs sessions that reached <strong>payment</strong> checkout (
              {data.funnelSessionsPayment} / {Math.max(data.funnelSessionsQuote, 1)} quote sessions).
            </CardContent>
          </Card>
          {data.notificationsToday ? (
            <NotificationDeliverySummaryCard n={data.notificationsToday} />
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
