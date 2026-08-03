"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useAdminData } from "@/hooks/useAdminData";
import type { OpsSnapshot } from "@/lib/admin/opsSnapshot";
import {
  buildOfficeScheduleCleanersById,
  computeOfficeScheduleCleanerStats,
  officeScheduleAssignedCleanerLabel,
  rosterIncludesWeekdayForSchedule,
  weekdayIndexForScheduleYmd,
  type OfficeScheduleDayResponse,
} from "@/lib/admin/officeScheduleDayPresentation";
import {
  computeOfficeTodayScheduleStats,
  officeScheduleStatusPresentation,
} from "@/lib/admin/officeTodayScheduleStats";
import {
  ArrowUpRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  RefreshCw,
  Send,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

type DashboardStats = {
  fetchedAt?: string;
  revenueTodayZar?: number;
  revenueMonthZar?: number;
  paidBookingsToday?: number;
  paidBookingsMonth?: number;
  totalBookingsWindow?: number;
  avgBookingValueZar?: number;
  revenueScope?: string;
  notificationsToday?: {
    available?: boolean;
    email: { sent: number; failed: number };
    whatsapp: { sent: number; failed: number };
    sms: { sent: number; failed: number };
    whatsappSuccessRatePct: number | null;
    allChannelsDegraded?: boolean;
  };
  paymentsSnapshot?: {
    pendingZar: number;
    pendingCount: number;
    overdueZar: number;
    overdueCount: number;
    refunds30dZar: number;
    refunds30dCount: number;
  };
  systemStatus?: {
    website?: "operational" | "degraded" | "down" | "warning";
    bookingEngine?: "operational" | "degraded" | "down" | "warning";
    paymentGateway?: "operational" | "degraded" | "down" | "warning";
    cronErrorsLast24h?: number;
  };
};

type BreakdownSegment = {
  key: string;
  label: string;
  value: number;
  color: string;
  legendColor: string;
};

type ActionItem = {
  key: string;
  label: string;
  count: number;
  detail: string;
  href: string;
  tone: "critical" | "warning" | "info" | "clear";
};

type StatusAlert = {
  key: string;
  label: string;
  tone: "ok" | "warning" | "critical";
  href?: string;
};

function zar(value: number): string {
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}

function johannesburgTodayYmd(): string {
  const parts = new Intl.DateTimeFormat("en-ZA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatDashboardDateLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function ZohoPanel({
  title,
  href,
  linkLabel = "View report",
  children,
  className,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-lg border border-slate-200 bg-white shadow-sm", className)}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {href ? (
          <Link href={href} className="text-xs font-medium text-[#2c79ff] hover:underline">
            {linkLabel}
          </Link>
        ) : null}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function HorizontalBreakdownBar({ segments, total }: { segments: BreakdownSegment[]; total: number }) {
  const safeTotal = Math.max(total, segments.reduce((sum, segment) => sum + segment.value, 0), 1);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-slate-100">
        {segments.map((segment) => {
          const width = (segment.value / safeTotal) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={segment.key}
              className={cn("h-full transition-all", segment.color)}
              style={{ width: `${width}%` }}
              title={`${segment.label}: ${segment.value}`}
            />
          );
        })}
      </div>
      <div className="mt-4 space-y-2.5">
        {segments.map((segment) => (
          <div key={segment.key} className="flex items-center justify-between gap-3 text-sm">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", segment.legendColor)} />
              <span className="truncate text-slate-600">{segment.label}</span>
            </div>
            <div className="flex shrink-0 items-center gap-3 tabular-nums">
              <span className="font-semibold text-slate-900">{segment.value}</span>
              <span className="w-10 text-right text-xs text-slate-400">{pct(segment.value, safeTotal)}%</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatusStrip({ alerts }: { alerts: StatusAlert[] }) {
  const hasIssues = alerts.some((alert) => alert.tone !== "ok");
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-lg border px-4 py-2.5 text-xs",
        hasIssues ? "border-amber-200 bg-amber-50/80" : "border-emerald-200 bg-emerald-50/80",
      )}
    >
      <span className="mr-1 font-semibold uppercase tracking-wide text-slate-500">Status</span>
      {alerts.map((alert) => {
        const toneClass =
          alert.tone === "critical"
            ? "border-red-200 bg-white text-red-700"
            : alert.tone === "warning"
              ? "border-amber-200 bg-white text-amber-800"
              : "border-emerald-200 bg-white text-emerald-700";
        const content = (
          <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-medium", toneClass)}>
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                alert.tone === "critical" ? "bg-red-500" : alert.tone === "warning" ? "bg-amber-500" : "bg-emerald-500",
              )}
            />
            {alert.label}
          </span>
        );
        return alert.href ? (
          <Link key={alert.key} href={alert.href} className="hover:opacity-80">
            {content}
          </Link>
        ) : (
          <span key={alert.key}>{content}</span>
        );
      })}
    </div>
  );
}

function ActionQueueRow({ item }: { item: ActionItem }) {
  const toneStyles = {
    critical: "border-red-100 bg-red-50/50 hover:bg-red-50",
    warning: "border-amber-100 bg-amber-50/50 hover:bg-amber-50",
    info: "border-blue-100 bg-blue-50/50 hover:bg-blue-50",
    clear: "border-slate-100 bg-slate-50/50 hover:bg-slate-50",
  };
  const countStyles = {
    critical: "text-red-700",
    warning: "text-amber-700",
    info: "text-blue-700",
    clear: "text-emerald-700",
  };
  const testIdByKey: Record<string, string> = {
    unassigned: "office-metric-action-unassigned",
    "starting-soon": "office-metric-action-starting-soon",
    sla: "office-metric-action-sla",
    unassignable: "office-metric-action-unassignable",
  };
  return (
    <Link
      href={item.href}
      data-testid={testIdByKey[item.key]}
      className={cn("group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors", toneStyles[item.tone])}
    >
      <p
        data-testid={testIdByKey[item.key] ? `${testIdByKey[item.key]}-count` : undefined}
        className={cn("w-10 shrink-0 text-xl font-bold tabular-nums", countStyles[item.tone])}
      >
        {item.count}
      </p>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-800">{item.label}</p>
        <p className="text-xs text-slate-500">{item.detail}</p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-slate-500" />
    </Link>
  );
}

function QuickLinkFooter() {
  const links = [
    { label: "Full schedule", href: "/office/schedule" },
    { label: "Ops health", href: "/office/ops-health" },
    { label: "Analytics", href: "/office/analytics" },
    { label: "Payouts", href: "/office/payouts" },
    { label: "Notification logs", href: "/office/notification-logs" },
    { label: "Cleaners", href: "/office/cleaners" },
  ];
  return (
    <footer className="rounded-lg border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Quick links</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {links.map((link) => (
          <Link key={link.href} href={link.href} className="inline-flex items-center gap-1 text-sm font-medium text-[#2c79ff] hover:underline">
            {link.label}
            <ExternalLink className="h-3 w-3 opacity-60" />
          </Link>
        ))}
      </div>
    </footer>
  );
}

export default function OfficeDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [selectedYmd, setSelectedYmd] = useState(() => johannesburgTodayYmd());

  const { data: opsData, refetch: refetchOps } = useAdminData<OpsSnapshot>("/api/admin/ops-snapshot");
  const todayYmd = johannesburgTodayYmd();
  const isViewingToday = selectedYmd === todayYmd;
  const { data: scheduleData, refetch: refetchSchedule } = useAdminData<OfficeScheduleDayResponse>(
    "/api/admin/schedule/day",
    { params: { date: selectedYmd } },
  );

  const todayBookings = useMemo(() => scheduleData?.bookings ?? [], [scheduleData?.bookings]);
  const todayStats = scheduleData?.summary ?? computeOfficeTodayScheduleStats(todayBookings);
  const visitFinance = scheduleData?.finance;
  const cleaners = useMemo(() => scheduleData?.cleaners ?? [], [scheduleData?.cleaners]);

  const cleanerStats = useMemo(
    () => computeOfficeScheduleCleanerStats({ bookings: todayBookings, cleaners, dateYmd: selectedYmd }),
    [todayBookings, cleaners, selectedYmd],
  );

  const availableCleaners = useMemo(() => {
    const unavailableStatuses = new Set(["assigned", "confirmed", "in_progress", "en_route"]);
    const bookedCleanerIds = new Set<string>();
    for (const booking of todayBookings) {
      const status = String(booking.status ?? "").trim().toLowerCase();
      if (!unavailableStatuses.has(status)) continue;
      const rosterIds = (booking.booking_cleaners ?? [])
        .map((member) => String(member.cleaner_id ?? "").trim())
        .filter(Boolean);
      if (rosterIds.length > 0) {
        rosterIds.forEach((id) => bookedCleanerIds.add(id));
      } else {
        const directId = String(booking.cleaner_id ?? "").trim();
        if (directId) bookedCleanerIds.add(directId);
      }
    }

    const weekday = weekdayIndexForScheduleYmd(selectedYmd);
    return cleaners
      .filter((cleaner) => {
        const status = String(cleaner.status ?? "").trim().toLowerCase();
        const active = cleaner.is_active !== false;
        const online = status !== "offline" && status !== "paused" && status !== "suspended";
        const rosterDay = rosterIncludesWeekdayForSchedule(cleaner.availability_weekdays, weekday);
        return active && online && cleaner.is_available === true && rosterDay && !bookedCleanerIds.has(cleaner.id);
      })
      .sort((a, b) => String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")));
  }, [cleaners, selectedYmd, todayBookings]);

  const cleanersById = useMemo(() => buildOfficeScheduleCleanersById(cleaners), [cleaners]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await globalThis.fetch("/api/admin/dashboard-stats", { headers });
        if (res.ok) {
          const data = (await res.json()) as DashboardStats;
          if (!cancelled) setStats(data);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lastRefresh]);

  const selectedDateLabel = formatDashboardDateLabel(selectedYmd);
  const dayOpsTitle = isViewingToday ? "Today's operations" : "Day operations";
  const dayScheduleTitle = isViewingToday ? "Today's schedule" : "Day schedule";
  const bookingsCountLabel = isViewingToday ? "Total bookings today" : "Total bookings";

  const slaBreachCount = opsData?.slaBreaches ?? 0;
  const unassignedCount = opsData?.unassigned ?? 0;
  const unassignedTodayFleet = opsData?.unassignedToday ?? 0;
  const unassignedPastDue = opsData?.unassignedPastDue ?? 0;
  const unassignedUpcoming = opsData?.unassignedUpcoming ?? 0;
  const startingSoonCount = opsData?.startingSoon ?? 0;
  const unassignableCount = opsData?.unassignable ?? 0;
  const oldestBreachMinutes = opsData?.oldestBreachMinutes ?? 0;

  const revenueToday = stats?.revenueTodayZar ?? 0;
  const paymentsSnapshot = stats?.paymentsSnapshot;
  const systemStatus = stats?.systemStatus;
  const overdueZar = paymentsSnapshot?.overdueZar ?? 0;
  const pendingZar = paymentsSnapshot?.pendingZar ?? 0;
  const smsFailed = stats?.notificationsToday?.sms.failed ?? 0;
  const cronErrors = systemStatus?.cronErrorsLast24h ?? 0;
  const allSystemsOperational =
    stats != null &&
    systemStatus?.website === "operational" &&
    systemStatus?.bookingEngine === "operational" &&
    systemStatus?.paymentGateway === "operational";

  const scheduleSegments: BreakdownSegment[] = [
    { key: "completed", label: "Completed", value: todayStats.completed, color: "bg-emerald-500", legendColor: "bg-emerald-500" },
    { key: "in_progress", label: "In progress", value: todayStats.inProgress, color: "bg-violet-500", legendColor: "bg-violet-500" },
    { key: "upcoming", label: "Upcoming", value: todayStats.upcoming, color: "bg-sky-400", legendColor: "bg-sky-400" },
    { key: "unassigned", label: "Unassigned", value: todayStats.unassigned, color: "bg-amber-500", legendColor: "bg-amber-500" },
  ];

  const cleanerSegments: BreakdownSegment[] = [
    { key: "available", label: "Available", value: cleanerStats.availableIdle, color: "bg-emerald-500", legendColor: "bg-emerald-500" },
    { key: "busy", label: "Booked / in job", value: cleanerStats.busy, color: "bg-blue-500", legendColor: "bg-blue-500" },
    { key: "off-today", label: "Off today", value: cleanerStats.offToday, color: "bg-amber-300", legendColor: "bg-amber-300" },
    { key: "unavailable", label: "Offline / paused", value: cleanerStats.manuallyUnavailable, color: "bg-slate-300", legendColor: "bg-slate-300" },
  ];

  const cashSegments: BreakdownSegment[] = [
    { key: "paid", label: "Payments received today", value: revenueToday, color: "bg-emerald-500", legendColor: "bg-emerald-500" },
    { key: "pending", label: "Pending bookings", value: pendingZar, color: "bg-sky-400", legendColor: "bg-sky-400" },
    { key: "overdue", label: "Overdue invoices", value: overdueZar, color: "bg-amber-500", legendColor: "bg-amber-500" },
  ];
  const cashTotal = revenueToday + pendingZar + overdueZar;

  const actionItems: ActionItem[] = useMemo(() => {
    const unassignedDetail =
      unassignedCount === 0
        ? "All bookings have cleaners"
        : unassignedPastDue > 0
          ? `${unassignedPastDue} past due · ${unassignedTodayFleet} today · ${unassignedUpcoming} upcoming`
          : unassignedTodayFleet > 0
            ? `${unassignedTodayFleet} today · ${unassignedUpcoming} upcoming`
            : `${unassignedUpcoming} upcoming visits need cleaners`;
    const items: ActionItem[] = [
      {
        key: "unassigned",
        label: "Unassigned bookings",
        count: unassignedCount,
        detail: unassignedDetail,
        href: "/office/bookings?filter=unassigned",
        tone: unassignedPastDue > 0 ? "critical" : unassignedCount > 0 ? "warning" : "clear",
      },
      {
        key: "starting-soon",
        label: "Starting within 2 hours",
        count: startingSoonCount,
        detail: startingSoonCount > 0 ? "No cleaner assigned yet" : "No urgent gaps",
        href: "/office/bookings?filter=starting-soon",
        tone: startingSoonCount > 0 ? "critical" : "clear",
      },
      {
        key: "sla",
        label: "SLA breaches",
        count: slaBreachCount,
        detail:
          slaBreachCount > 0
            ? oldestBreachMinutes < 60
              ? `Oldest: ${oldestBreachMinutes}m overdue`
              : `Oldest: ${Math.floor(oldestBreachMinutes / 60)}h ${oldestBreachMinutes % 60}m overdue`
            : "All SLAs on track",
        href: "/office/sla-breaches",
        tone: slaBreachCount > 0 ? "critical" : "clear",
      },
      {
        key: "unassignable",
        label: "Unassignable",
        count: unassignableCount,
        detail: unassignableCount > 0 ? "Review dispatch constraints" : "No blocked assignments",
        href: "/office/bookings?filter=unassignable",
        tone: unassignableCount > 0 ? "warning" : "clear",
      },
    ];
    return items.sort((a, b) => {
      const toneRank = { critical: 0, warning: 1, info: 2, clear: 3 };
      return toneRank[a.tone] - toneRank[b.tone] || b.count - a.count;
    });
  }, [oldestBreachMinutes, slaBreachCount, startingSoonCount, unassignableCount, unassignedCount, unassignedPastDue, unassignedTodayFleet, unassignedUpcoming]);

  const statusAlerts: StatusAlert[] = useMemo(() => {
    const alerts: StatusAlert[] = [];
    if (allSystemsOperational) alerts.push({ key: "ops", label: "Ops healthy", tone: "ok" });
    else if (systemStatus?.website === "down" || systemStatus?.bookingEngine === "down") {
      alerts.push({ key: "ops", label: "Ops degraded", tone: "critical", href: "/office/ops-health" });
    } else if (stats != null) alerts.push({ key: "ops", label: "Ops needs attention", tone: "warning", href: "/office/ops-health" });

    if (unassignedCount > 0) {
      alerts.push({
        key: "unassigned",
        label:
          unassignedPastDue > 0
            ? `${unassignedCount} unassigned (${unassignedPastDue} overdue)`
            : unassignedTodayFleet > 0
              ? `${unassignedTodayFleet} unassigned today`
              : `${unassignedCount} unassigned upcoming`,
        tone: unassignedPastDue > 0 ? "critical" : "warning",
        href: "/office/bookings?filter=unassigned",
      });
    }
    if (overdueZar > 0) alerts.push({ key: "overdue", label: `${zar(overdueZar)} overdue`, tone: "critical", href: "/office/invoices" });
    if (startingSoonCount > 0) alerts.push({ key: "starting", label: `${startingSoonCount} starting soon`, tone: "critical", href: "/office/bookings?filter=starting-soon" });
    if (smsFailed > 0) alerts.push({ key: "sms", label: "SMS failing", tone: "warning", href: "/office/notification-logs" });
    if (cronErrors > 0) alerts.push({ key: "cron", label: `${cronErrors} cron errors (24h)`, tone: "warning", href: "/office/ops-health" });
    if (alerts.length === 0) alerts.push({ key: "all-clear", label: "All clear today", tone: "ok" });
    return alerts;
  }, [allSystemsOperational, cronErrors, overdueZar, smsFailed, startingSoonCount, stats, systemStatus, unassignedCount, unassignedPastDue, unassignedTodayFleet]);

  const sortedBookings = [...todayBookings].sort((a, b) => String(a.time ?? "").localeCompare(String(b.time ?? "")));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Hello, Shalean Cleaning Services</h1>
          <p className="mt-0.5 text-sm text-slate-500">Command center — today&apos;s operations at a glance.</p>
        </div>
        <div className="flex items-center gap-2">
          <label className="relative flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 hover:bg-slate-50">
            <Calendar className="h-4 w-4 text-slate-400" aria-hidden />
            <span>{selectedDateLabel}</span>
            <input
              type="date"
              value={selectedYmd}
              onChange={(event) => {
                const next = event.target.value.trim();
                if (/^\d{4}-\d{2}-\d{2}$/.test(next)) setSelectedYmd(next);
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label="Select dashboard date"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setLastRefresh(new Date());
              void refetchOps();
              void refetchSchedule();
            }}
            className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      <StatusStrip alerts={statusAlerts} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ZohoPanel title={dayOpsTitle} href="/office/schedule" linkLabel="View schedule">
          <div className="mb-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{bookingsCountLabel}</p>
              <p data-testid="office-metric-ops-total" className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{todayStats.total}</p>
              {todayStats.cancelled > 0 ? (
                <p data-testid="office-metric-ops-cancelled-excluded" className="mt-0.5 text-[11px] text-slate-400">{todayStats.cancelled} cancelled / expired excluded</p>
              ) : null}
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Payments received today</p>
              <p data-testid="office-metric-ops-payments-received-today" className="text-lg font-bold tabular-nums text-emerald-700">
                {stats != null ? zar(revenueToday) : loading ? "…" : "—"}
              </p>
              <p data-testid="office-metric-ops-paid-by-payment-time" className="text-[11px] text-slate-400">{stats?.paidBookingsToday ?? 0} paid by payment time</p>
              {visitFinance ? (
                <p data-testid="office-metric-ops-visit-paid-value" className="mt-1 text-[11px] text-slate-500">
                  Visit paid value {zar(visitFinance.paidValueZar)}{visitFinance.unpaidCompletedCount > 0 ? ` · ${visitFinance.unpaidCompletedCount} completed unpaid` : ""}
                </p>
              ) : null}
            </div>
          </div>
          <div className="sr-only" aria-hidden>
            <span data-testid="office-metric-ops-completed">{todayStats.completed}</span>
            <span data-testid="office-metric-ops-in-progress">{todayStats.inProgress}</span>
            <span data-testid="office-metric-ops-upcoming">{todayStats.upcoming}</span>
            <span data-testid="office-metric-ops-unassigned">{todayStats.unassigned}</span>
          </div>
          <HorizontalBreakdownBar segments={scheduleSegments} total={todayStats.total} />
        </ZohoPanel>

        <ZohoPanel title="Needs action" href="/office/bookings" linkLabel="View all bookings">
          <div className="mb-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Priority queue</p>
            <p className="mt-1 text-sm text-slate-500">All open bookings — ranked by urgency. Today&apos;s schedule counts are separate.</p>
          </div>
          <div className="space-y-2">{actionItems.map((item) => <ActionQueueRow key={item.key} item={item} />)}</div>
        </ZohoPanel>
      </div>

      <ZohoPanel title={dayScheduleTitle} href="/office/schedule" linkLabel="Full schedule">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-4">
            {[
              { label: "Total", value: todayStats.total, testId: "office-metric-schedule-total" },
              { label: "Completed", value: todayStats.completed, testId: "office-metric-schedule-completed" },
              { label: "In progress", value: todayStats.inProgress, testId: "office-metric-schedule-in-progress" },
              { label: "Upcoming", value: todayStats.upcoming, testId: "office-metric-schedule-upcoming" },
              { label: "Unassigned", value: todayStats.unassigned, testId: "office-metric-schedule-unassigned" },
            ].map((stat) => (
              <div key={stat.label} className="min-w-[72px]">
                <p data-testid={stat.testId} className={cn("text-lg font-bold tabular-nums", stat.label === "Unassigned" && stat.value > 0 ? "text-amber-700" : "text-slate-900")}>{stat.value}</p>
                <p className="text-[11px] text-slate-500">{stat.label}</p>
              </div>
            ))}
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Live
          </span>
        </div>

        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {sortedBookings.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">No bookings scheduled for this date.</p>
          ) : (
            sortedBookings.slice(0, 8).map((booking) => {
              const { label: statusLabel, tone } = officeScheduleStatusPresentation(booking);
              const assignedCleaner = officeScheduleAssignedCleanerLabel(booking, cleanersById);
              const statusColor =
                tone === "unassigned"
                  ? "bg-amber-100 text-amber-800"
                  : tone === "completed"
                    ? "bg-emerald-100 text-emerald-800"
                    : tone === "in_progress"
                      ? "bg-violet-100 text-violet-800"
                      : tone === "assigned"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-slate-100 text-slate-700";
              return (
                <Link key={booking.id} href={`/office/bookings/${booking.id}`} className="group flex items-center gap-4 px-4 py-3 hover:bg-slate-50">
                  <span className="w-14 shrink-0 text-sm font-semibold tabular-nums text-slate-700">{booking.time?.slice(0, 5) ?? "—"}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium capitalize text-slate-900">{(booking.service ?? "Service").replace(/-/g, " ")}</p>
                    <p className="truncate text-xs text-slate-500">{booking.location ?? "No location"}</p>
                    {assignedCleaner ? (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs font-medium text-slate-600">
                        <UserCheck className="h-3 w-3 shrink-0 text-slate-400" /> {assignedCleaner}
                      </p>
                    ) : null}
                  </div>
                  <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold", statusColor)}>{statusLabel}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 opacity-0 transition-opacity group-hover:opacity-100" />
                </Link>
              );
            })
          )}
        </div>
        {sortedBookings.length > 8 ? (
          <Link href="/office/schedule" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-[#2c79ff] hover:underline">
            + {sortedBookings.length - 8} more bookings <ArrowUpRight className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </ZohoPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <ZohoPanel title="Cleaner capacity" href="/office/cleaners" linkLabel="Manage cleaners">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Active workforce</p>
              <p data-testid="office-metric-capacity-active" className="mt-1 text-3xl font-bold tabular-nums text-slate-900">{cleanerStats.total}</p>
              <p className="text-xs text-slate-500">active cleaners on roster</p>
            </div>
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-right">
              <p className="text-xs text-emerald-700">Available for this date</p>
              <p data-testid="office-metric-capacity-available-now" className="text-xl font-bold tabular-nums text-emerald-800">{availableCleaners.length}</p>
            </div>
          </div>
          <div className="sr-only" aria-hidden>
            <span data-testid="office-metric-capacity-available">{availableCleaners.length}</span>
            <span data-testid="office-metric-capacity-busy">{cleanerStats.busy}</span>
            <span data-testid="office-metric-capacity-off-today">{cleanerStats.offToday}</span>
            <span data-testid="office-metric-capacity-offline">{cleanerStats.manuallyUnavailable}</span>
          </div>
          <HorizontalBreakdownBar
            segments={cleanerSegments.map((segment) => segment.key === "available" ? { ...segment, value: availableCleaners.length } : segment)}
            total={cleanerStats.total}
          />

          <div className="mt-5 border-t border-slate-100 pt-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Available cleaners</p>
                <p className="mt-0.5 text-xs text-slate-500">Online, rostered and not allocated on {selectedDateLabel}.</p>
              </div>
              <Users className="h-4 w-4 text-emerald-600" />
            </div>

            {availableCleaners.length === 0 ? (
              <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-center text-sm text-slate-500">
                No cleaners are currently available for this date.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {availableCleaners.slice(0, 8).map((cleaner) => (
                  <div key={cleaner.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{cleaner.full_name?.trim() || "Unnamed cleaner"}</p>
                        <p className="text-[11px] text-emerald-700">Available</p>
                      </div>
                    </div>
                    <Link href="/office/bookings?filter=unassigned" className="shrink-0 text-xs font-semibold text-[#2c79ff] hover:underline">
                      Assign
                    </Link>
                  </div>
                ))}
              </div>
            )}

            {availableCleaners.length > 8 ? (
              <Link href="/office/cleaners" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[#2c79ff] hover:underline">
                View all {availableCleaners.length} available cleaners <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            ) : null}
          </div>
        </ZohoPanel>

        <ZohoPanel title="Revenue & receivables" href="/office/payment-reconciliation" linkLabel="Reconcile payments">
          <div className="mb-4 flex items-end justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Receivables exposure</p>
              <p data-testid="office-metric-revenue-receivables-exposure" className="mt-1 text-3xl font-bold tabular-nums text-slate-900">
                {stats != null ? zar(cashTotal) : loading ? "…" : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-slate-400">Payments received today + pending bookings + overdue invoices (not bank cash)</p>
            </div>
            {overdueZar > 0 ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2 text-right">
                <p className="text-xs text-amber-700">At risk</p>
                <p className="text-lg font-bold tabular-nums text-amber-800">{zar(overdueZar)}</p>
              </div>
            ) : null}
          </div>
          <div className="sr-only" aria-hidden>
            <span data-testid="office-metric-revenue-payments-received-today">{stats != null ? zar(revenueToday) : "—"}</span>
            <span data-testid="office-metric-revenue-pending-bookings">{stats != null ? zar(pendingZar) : "—"}</span>
            <span data-testid="office-metric-revenue-overdue-invoices">{stats != null ? zar(overdueZar) : "—"}</span>
          </div>
          <HorizontalBreakdownBar segments={cashSegments} total={cashTotal} />
          <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
            <Link href="/office/cleaners" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              <UserCheck className="h-3.5 w-3.5 text-[#2c79ff]" /> Assign cleaners
            </Link>
            <Link href="/office/bookings/create" className="inline-flex items-center gap-1.5 rounded-md bg-[#2c79ff] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1a68ee]">
              <TrendingUp className="h-3.5 w-3.5" /> Create booking
            </Link>
            <Link href="/office/notifications" className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100">
              <Send className="h-3.5 w-3.5 text-[#2c79ff]" /> Notify
            </Link>
          </div>
        </ZohoPanel>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Bookings (30d)", value: stats != null ? String(stats.totalBookingsWindow ?? 0) : loading ? "…" : "—", sub: "Paid, revenue-eligible", icon: BarChart3, href: "/office/analytics", testId: "office-metric-summary-bookings-30d" },
          { label: "Avg booking value", value: stats != null ? zar(stats.avgBookingValueZar ?? 0) : loading ? "…" : "—", sub: "30-day window", icon: Zap, href: "/office/analytics", testId: "office-metric-summary-avg-booking-value" },
          { label: "Pending payments", value: stats != null ? zar(pendingZar) : loading ? "…" : "—", sub: `${paymentsSnapshot?.pendingCount ?? 0} awaiting payment`, icon: Clock, href: "/office/bookings", testId: "office-metric-summary-pending-payments" },
          { label: "System health", value: allSystemsOperational ? "Healthy" : cronErrors > 0 ? `${cronErrors} errors` : "Attention", sub: allSystemsOperational ? "All services operational" : "View ops health", icon: allSystemsOperational ? CheckCircle2 : Shield, href: "/office/ops-health", tone: allSystemsOperational ? "ok" : "warn", testId: "office-metric-summary-system-health" },
        ].map((kpi) => {
          const KpiIcon = kpi.icon;
          return (
            <Link key={kpi.label} href={kpi.href} className="group rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
                  <p data-testid={kpi.testId} className={cn("mt-1 text-xl font-bold tabular-nums", kpi.tone === "ok" ? "text-emerald-700" : kpi.tone === "warn" ? "text-amber-700" : "text-slate-900")}>{kpi.value}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">{kpi.sub}</p>
                </div>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-50 text-slate-500 group-hover:bg-blue-50 group-hover:text-[#2c79ff]">
                  <KpiIcon className="h-4 w-4" />
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <QuickLinkFooter />
    </div>
  );
}
