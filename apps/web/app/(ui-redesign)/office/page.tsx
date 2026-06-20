"use client";

import React from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { useAdminData } from "@/hooks/useAdminData";
import type { OpsSnapshot } from "@/lib/admin/opsSnapshot";
import { deriveCleanerAvailabilityState } from "@/lib/cleaner/cleanerAvailabilityState";
import {
  computeOfficeTodayScheduleStats,
  officeScheduleStatusPresentation,
  type OfficeTodayScheduleStats,
} from "@/lib/admin/officeTodayScheduleStats";
import {
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  DollarSign,
  Mail,
  MessageSquare,
  RefreshCw,
  Send,
  Shield,
  TrendingUp,
  UserCheck,
  Users,
  Zap,
  CircleDot,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ─────────────────────────────────────────────────────────────────
type DashboardStats = {
  fetchedAt?: string;
  revenueTodayZar?: number;
  revenueMonthZar?: number;
  paidBookingsToday?: number;
  paidBookingsMonth?: number;
  totalBookingsWindow?: number;
  avgBookingValueZar?: number;
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
  recentActivity?: Array<{
    createdAt: string;
    type: string;
    details: string;
    user: string;
    severity: "success" | "info" | "warning" | "error" | string;
  }>;
  systemStatus?: {
    website?: "operational" | "degraded" | "down" | "warning";
    bookingEngine?: "operational" | "degraded" | "down" | "warning";
    paymentGateway?: "operational" | "degraded" | "down" | "warning";
    productionHealth?: {
      generatedAt?: string;
      totals?: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        info: number;
      };
      totalFindings?: number;
      topFindings?: Array<{
        code: string;
        severity: string;
        count: number;
        message: string;
      }>;
      error?: string;
    };
    cronErrorsLast24h?: number;
  };
};

// ─── Sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-500">{title}</h2>
  );
}

function KpiCard({
  label,
  value,
  sub,
  trend,
  trendDir,
  icon: Icon,
  iconColor = "bg-blue-50 text-blue-600",
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  trendDir?: "up" | "down";
  icon: React.ComponentType<{ className?: string }>;
  iconColor?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-100">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1.5 text-2xl font-bold tabular-nums text-slate-900">{value}</p>
          {sub ? <p className="mt-0.5 text-xs text-slate-400">{sub}</p> : null}
          {trend ? (
            <div className={cn("mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
              trendDir === "up" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
            )}>
              {trendDir === "up"
                ? <ArrowUpRight className="h-3 w-3" />
                : <ArrowDownRight className="h-3 w-3" />}
              {trend}
            </div>
          ) : null}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: "operational" | "degraded" | "down" | "warning" }) {
  const map = {
    operational: "bg-emerald-50 text-emerald-700 border-emerald-200",
    degraded: "bg-orange-50 text-orange-700 border-orange-200",
    down: "bg-red-50 text-red-700 border-red-200",
    warning: "bg-yellow-50 text-yellow-700 border-yellow-200",
  };
  const labels = { operational: "Operational", degraded: "Degraded", down: "Down", warning: "Warning" };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold", map[status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        status === "operational" ? "bg-emerald-500" :
        status === "degraded" ? "bg-orange-500" :
        status === "warning" ? "bg-yellow-500" : "bg-red-500"
      )} />
      {labels[status]}
    </span>
  );
}

function zar(value: number): string {
  return `R ${Math.round(value).toLocaleString("en-ZA")}`;
}

function formatActivityTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function severityDot(severity: string): string {
  if (severity === "success") return "bg-emerald-500";
  if (severity === "warning") return "bg-orange-500";
  if (severity === "error") return "bg-red-500";
  return "bg-blue-500";
}

type SystemCheckStatus = "operational" | "degraded" | "down" | "warning";

function resolveSystemCheckStatus(
  value: SystemCheckStatus | undefined,
  loading: boolean,
  hasStats: boolean,
): SystemCheckStatus | null {
  if (loading && !hasStats) return null;
  if (value) return value;
  return "warning";
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

function weekdayIndexForYmd(ymd: string): number {
  const day = new Date(`${ymd}T12:00:00+02:00`).getDay();
  return Number.isFinite(day) ? day : new Date().getDay();
}

function rosterIncludesWeekday(raw: unknown, weekday: number): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return true;
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return raw.some((value) => {
    const v = String(value ?? "").trim().toLowerCase();
    if (!v) return false;
    const asNumber = Number(v);
    if (Number.isFinite(asNumber)) {
      return asNumber === weekday || asNumber === weekday + 1;
    }
    return v === names[weekday] || v.startsWith(names[weekday]);
  });
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function OfficeDashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(new Date());

  // Real-time ops counts for attention cards
  const { data: opsData, refetch: refetchOps } = useAdminData<OpsSnapshot>("/api/admin/ops-snapshot");

  // Today's schedule for the schedule panel
  const todayYmd = johannesburgTodayYmd();
  const { data: scheduleData } = useAdminData<{
    bookings: Array<{
      id: string;
      time: string | null;
      service: string | null;
      location: string | null;
      status: string | null;
      cleaner_id: string | null;
      selected_cleaner_id?: string | null;
      team_id?: string | null;
    }>;
    summary?: OfficeTodayScheduleStats;
    cleaners: Array<{
      id: string;
      full_name: string | null;
      is_available: boolean | null;
      status?: string | null;
      availability_weekdays?: unknown;
    }>;
  }>("/api/admin/schedule/day", { params: { date: todayYmd } });

  const todayBookings = scheduleData?.bookings ?? [];
  const todayStats = scheduleData?.summary ?? computeOfficeTodayScheduleStats(todayBookings);
  const activeCleanerIds = new Set(
    todayBookings
      .filter((b) => {
        const st = String(b.status ?? "").toLowerCase();
        return st === "in_progress" || st === "en_route";
      })
      .flatMap((b) => [b.cleaner_id, b.selected_cleaner_id].filter(Boolean) as string[]),
  );
  const bookedCleanerIds = new Set(
    todayBookings
      .filter((b) => {
        const st = String(b.status ?? "").toLowerCase();
        return (st === "assigned" || st === "confirmed") && (b.cleaner_id || b.selected_cleaner_id);
      })
      .flatMap((b) => [b.cleaner_id, b.selected_cleaner_id].filter(Boolean) as string[]),
  );
  const weekday = weekdayIndexForYmd(todayYmd);
  const cleanerStates = (scheduleData?.cleaners ?? []).map((cleaner) =>
    deriveCleanerAvailabilityState({
      browserOnline: String(cleaner.status ?? "").toLowerCase() !== "offline",
      isAvailable: cleaner.is_available === true,
      rosterIncludesToday: rosterIncludesWeekday(cleaner.availability_weekdays, weekday),
      hasActiveJob: activeCleanerIds.has(cleaner.id),
      hasFutureBookedJob: bookedCleanerIds.has(cleaner.id),
    }),
  );
  const cleanerStats = {
    total: scheduleData?.cleaners?.length ?? 0,
    availableIdle: cleanerStates.filter((s) => s.stateKey === "online").length,
    busy: cleanerStates.filter((s) => s.stateKey === "booked" || s.stateKey === "in-job").length,
    notReceiving: cleanerStates.filter((s) => s.stateKey === "paused" || s.stateKey === "offline" || s.stateKey === "off-today").length,
  };
  const busyCleaners = cleanerStats.busy;
  const offlineCleaners = cleanerStats.notReceiving;
  const availablePct = cleanerStats.total > 0 ? Math.round((cleanerStats.availableIdle / cleanerStats.total) * 1000) / 10 : 0;
  const busyPct = cleanerStats.total > 0 ? Math.round((busyCleaners / cleanerStats.total) * 1000) / 10 : 0;
  const offlinePct = Math.max(0, 100 - availablePct - busyPct);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const sb = getSupabaseBrowser();
        const token = (await sb?.auth.getSession())?.data.session?.access_token;
        const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await globalThis.fetch("/api/admin/dashboard-stats", { headers });
        if (res.ok) {
          const data = await res.json() as DashboardStats;
          if (!cancelled) setStats(data);
        }
      } catch {}
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [lastRefresh]);

  const todayLabel = new Date().toLocaleDateString("en-ZA", {
    weekday: "short", day: "numeric", month: "short", year: "numeric",
  });

  // Real ops counts
  const slaBreachCount = opsData?.slaBreaches ?? 0;
  const unassignedCount = opsData?.unassigned ?? 0;
  const startingSoonCount = opsData?.startingSoon ?? 0;
  const unassignableCount = opsData?.unassignable ?? 0;
  const oldestBreachMinutes = opsData?.oldestBreachMinutes ?? 0;

  function formatOldestBreach(mins: number): string {
    if (mins === 0) return "All clear";
    if (mins < 60) return `Oldest: ${mins}m overdue`;
    return `Oldest: ${Math.floor(mins / 60)}h ${mins % 60}m overdue`;
  }

  const revenueToday = stats?.revenueTodayZar ?? 0;
  const bookings30d = stats?.totalBookingsWindow ?? 0;
  const avgBooking = stats?.avgBookingValueZar ?? 0;
  const paymentsSnapshot = stats?.paymentsSnapshot;
  const recentActivity = stats?.recentActivity ?? [];
  const systemStatus = stats?.systemStatus;

  const emailSent = stats?.notificationsToday?.email.sent ?? 0;
  const emailFailed = stats?.notificationsToday?.email.failed ?? 0;
  const waSent = stats?.notificationsToday?.whatsapp.sent ?? 0;
  const waFailed = stats?.notificationsToday?.whatsapp.failed ?? 0;
  const smsSent = stats?.notificationsToday?.sms.sent ?? 0;
  const smsFailed = stats?.notificationsToday?.sms.failed ?? 0;

  const systemChecks: Array<{
    name: string;
    status: SystemCheckStatus | null;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    {
      name: "Website",
      status: resolveSystemCheckStatus(systemStatus?.website, loading, stats != null),
      icon: CircleDot,
    },
    {
      name: "Booking engine",
      status: resolveSystemCheckStatus(systemStatus?.bookingEngine, loading, stats != null),
      icon: Calendar,
    },
    {
      name: "Payment gateway",
      status: resolveSystemCheckStatus(systemStatus?.paymentGateway, loading, stats != null),
      icon: CreditCard,
    },
  ];
  const allSystemsOperational =
    stats != null &&
    systemStatus?.website === "operational" &&
    systemStatus?.bookingEngine === "operational" &&
    systemStatus?.paymentGateway === "operational";

  return (
    <div className="space-y-6">
      {/* ── Page Header ────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500">Overview of operations, bookings, revenue and system health.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600 shadow-sm">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>Today, {todayLabel}</span>
          </div>
          <button
            type="button"
            onClick={() => { setLoading(true); setLastRefresh(new Date()); void refetchOps(); }}
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </div>

      {/* ── Attention Required ─────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <SectionHeader title="Attention required" />
          <Link href="/office/sla-breaches" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
            View all ({slaBreachCount}) <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {/* SLA Breaches */}
          <Link href="/office/sla-breaches" className="group rounded-2xl bg-white border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", slaBreachCount > 0 ? "bg-red-100" : "bg-emerald-100")}>
                <Shield className={cn("h-4 w-4", slaBreachCount > 0 ? "text-red-600" : "text-emerald-600")} />
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{slaBreachCount}</p>
            <p className="text-sm font-semibold text-slate-700">SLA breaches</p>
            <p className={cn("mt-1 text-xs font-medium", slaBreachCount > 0 ? "text-red-600" : "text-emerald-600")}>
              {formatOldestBreach(oldestBreachMinutes)}
            </p>
          </Link>

          {/* Unassigned */}
          <Link href="/office/bookings?filter=unassigned" className="group rounded-2xl bg-white border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", unassignedCount > 0 ? "bg-orange-100" : "bg-emerald-100")}>
                <Users className={cn("h-4 w-4", unassignedCount > 0 ? "text-orange-600" : "text-emerald-600")} />
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{unassignedCount}</p>
            <p className="text-sm font-semibold text-slate-700">Unassigned bookings</p>
            <p className={cn("mt-1 text-xs font-medium", unassignedCount > 0 ? "text-orange-600" : "text-emerald-600")}>
              {unassignedCount > 0 ? "Needs attention" : "All clear"}
            </p>
          </Link>

          {/* Starting soon */}
          <Link href="/office/bookings?filter=starting-soon" className="group rounded-2xl bg-white border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", startingSoonCount > 0 ? "bg-blue-100" : "bg-emerald-100")}>
                <Clock className={cn("h-4 w-4", startingSoonCount > 0 ? "text-blue-600" : "text-emerald-600")} />
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{startingSoonCount}</p>
            <p className="text-sm font-semibold text-slate-700">Starting &lt;2h, no cleaner</p>
            <p className={cn("mt-1 text-xs font-medium", startingSoonCount > 0 ? "text-blue-600" : "text-emerald-600")}>
              {startingSoonCount > 0 ? "Assign now" : "All clear"}
            </p>
          </Link>

          {/* Unassignable */}
          <Link href="/office/bookings?filter=unassignable" className="group rounded-2xl bg-white border border-slate-100 p-4 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between">
              <div className={cn("flex h-8 w-8 items-center justify-center rounded-lg", unassignableCount > 0 ? "bg-red-100" : "bg-emerald-100")}>
                <CheckCircle2 className={cn("h-4 w-4", unassignableCount > 0 ? "text-red-600" : "text-emerald-600")} />
              </div>
              <ChevronRight className="h-4 w-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
            </div>
            <p className="mt-3 text-3xl font-bold tabular-nums text-slate-900">{unassignableCount}</p>
            <p className="text-sm font-semibold text-slate-700">Unassignable</p>
            <p className={cn("mt-1 text-xs font-medium", unassignableCount > 0 ? "text-red-600" : "text-emerald-600")}>
              {unassignableCount > 0 ? "Review dispatch" : "All clear"}
            </p>
          </Link>
        </div>
      </section>

      {/* ── Quick Actions ──────────────────────────────────────────────── */}
      <section className="rounded-2xl bg-white border border-slate-100 p-4 shadow-sm">
        <div className="mb-3">
          <p className="text-sm font-bold text-slate-800">Quick actions</p>
          <p className="text-xs text-slate-500">Common tasks to keep operations running smoothly.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/office/cleaners"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
            <UserCheck className="h-4 w-4 text-blue-600" />
            Assign cleaners
          </Link>
          <Link href="/office/schedule"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
            <Calendar className="h-4 w-4 text-blue-600" />
            Today&apos;s schedule
          </Link>
          <Link href="/office/payouts"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
            <CreditCard className="h-4 w-4 text-blue-600" />
            Review payments
          </Link>
          <Link href="/office/notifications"
            className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors">
            <Send className="h-4 w-4 text-blue-600" />
            Send notification
          </Link>
          <Link href="/office/bookings/create"
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors shadow-sm">
            <TrendingUp className="h-4 w-4" />
            Create booking
          </Link>
        </div>
      </section>

      {/* ── Revenue KPIs ───────────────────────────────────────────────── */}
      <section>
        <div className="mb-3">
          <SectionHeader title="Revenue overview" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            label="Revenue today"
            value={stats != null ? zar(revenueToday) : loading ? "…" : "—"}
            sub={`Paid bookings: ${stats?.paidBookingsToday ?? 0}`}
            icon={DollarSign}
            iconColor="bg-emerald-50 text-emerald-600"
          />
          <KpiCard
            label="Bookings (30d window)"
            value={stats != null ? bookings30d : loading ? "…" : "—"}
            sub="Revenue-eligible paid bookings"
            icon={BarChart3}
            iconColor="bg-violet-50 text-violet-600"
          />
          <KpiCard
            label="Avg booking value"
            value={stats != null ? zar(avgBooking) : loading ? "…" : "—"}
            sub="Among paid bookings in window"
            icon={Zap}
            iconColor="bg-orange-50 text-orange-600"
          />
          <KpiCard
            label="Today: bookings"
            value={todayStats.total}
            sub={`${todayStats.completed} completed · ${todayStats.unassigned} unassigned`}
            icon={TrendingUp}
            iconColor="bg-blue-50 text-blue-600"
          />
        </div>
      </section>

      {/* ── Schedule + Availability ─────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Today's Schedule */}
        <section className="lg:col-span-3 rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-800">Today&apos;s schedule</h3>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">LIVE</span>
            </div>
            <Link href="/office/schedule" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              View full schedule <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-4">
            {[
              { label: "Total bookings",    value: String(todayStats.total) },
              { label: "Completed",         value: String(todayStats.completed) },
              { label: "In progress",       value: String(todayStats.inProgress) },
              { label: "Upcoming",          value: String(todayStats.upcoming) },
              { label: "Unassigned",        value: String(todayStats.unassigned), alert: todayStats.unassigned > 0 },
            ].map((s) => (
              <div key={s.label} className="rounded-xl bg-slate-50 p-2.5 text-center">
                <p className={cn("text-lg font-bold tabular-nums", s.alert ? "text-red-600" : "text-slate-800")}>{s.value}</p>
                <p className="text-[10px] text-slate-500 leading-tight">{s.label}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Today&apos;s bookings</p>
            <div className="space-y-2">
              {todayBookings.length === 0 ? (
                <p className="text-center text-xs text-slate-400 py-4">No bookings for today.</p>
              ) : (
                todayBookings.slice(0, 4).map((b) => {
                  const { label: statusLabel, tone } = officeScheduleStatusPresentation(b);
                  const statusColor =
                    tone === "unassigned" ? "bg-orange-100 text-orange-700" :
                    tone === "completed" ? "bg-emerald-100 text-emerald-700" :
                    tone === "in_progress" ? "bg-violet-100 text-violet-700" :
                    tone === "assigned" ? "bg-blue-100 text-blue-700" :
                    "bg-slate-100 text-slate-700";
                  return (
                    <div key={b.id} className="flex items-center gap-3 rounded-xl border border-slate-100 px-3 py-2.5">
                      <span className="w-12 shrink-0 text-xs font-bold text-slate-600">{b.time?.slice(0, 5) ?? "—"}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 capitalize">{(b.service ?? "Service").replace(/-/g, " ")}</p>
                        <p className="text-xs text-slate-400 truncate">{b.location ?? "—"}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold", statusColor)}>{statusLabel}</span>
                    </div>
                  );
                })
              )}
              {todayBookings.length > 4 && (
                <Link href="/office/schedule" className="block w-full text-center text-xs font-semibold text-blue-600 hover:underline pt-1">
                  + {todayBookings.length - 4} more bookings
                </Link>
              )}
            </div>
          </div>
        </section>

        {/* Cleaner Availability */}
        <section className="lg:col-span-2 rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Cleaner availability</h3>
            <Link href="/office/cleaners" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              View all <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          {/* Donut chart (CSS) */}
          <div className="flex items-center justify-center py-2">
            <div className="relative flex h-32 w-32 items-center justify-center">
              <svg viewBox="0 0 36 36" className="h-32 w-32 -rotate-90">
                {/* Track */}
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#f1f5f9" strokeWidth="3.5" />
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#22c55e" strokeWidth="3.5"
                  strokeDasharray={`${availablePct} ${100 - availablePct}`} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#3b82f6" strokeWidth="3.5"
                  strokeDasharray={`${busyPct} ${100 - busyPct}`} strokeDashoffset={String(-availablePct)} strokeLinecap="round" />
                <circle cx="18" cy="18" r="15.9155" fill="none" stroke="#e2e8f0" strokeWidth="3.5"
                  strokeDasharray={`${offlinePct} ${100 - offlinePct}`} strokeDashoffset={String(-(availablePct + busyPct))} />
              </svg>
              <div className="absolute text-center">
                <p className="text-xl font-bold text-slate-800">{cleanerStats.total}</p>
                <p className="text-[10px] text-slate-400">Total cleaners</p>
              </div>
            </div>
          </div>

          <div className="mt-2 space-y-2">
            {[
              { label: "Available", count: cleanerStats.availableIdle, color: "bg-emerald-500" },
              { label: "Booked / in job", count: busyCleaners, color: "bg-blue-500" },
              { label: "Not receiving", count: offlineCleaners, color: "bg-slate-300" },
            ].map((s) => (
              <div key={s.label} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={cn("h-2.5 w-2.5 rounded-full", s.color)} />
                  <span className="text-sm text-slate-600">{s.label}</span>
                </div>
                <span className="text-sm font-bold text-slate-800">{s.count}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 border border-blue-100 p-3">
            <AlertCircle className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-blue-800">{startingSoonCount} bookings start within 2 hours without a cleaner</p>
              <p className="text-xs text-blue-600">{startingSoonCount > 0 ? "Review and assign where needed." : "No urgent cleaner gaps right now."}</p>
            </div>
            <Link href="/office/schedule" className="ml-auto shrink-0 rounded-lg bg-blue-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-blue-700 transition-colors whitespace-nowrap">
              Review now
            </Link>
          </div>
        </section>
      </div>

      {/* ── Payments + Notifications ────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Payments Snapshot */}
        <section className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Payments snapshot</h3>
            <Link href="/office/payouts" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              View all payments <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Paid (today)", value: zar(revenueToday), icon: CheckCircle2, iconColor: "text-emerald-600 bg-emerald-50" },
              { label: "Pending", value: zar(paymentsSnapshot?.pendingZar ?? 0), icon: Clock, iconColor: "text-orange-600 bg-orange-50" },
              { label: "Overdue", value: zar(paymentsSnapshot?.overdueZar ?? 0), icon: AlertTriangle, iconColor: "text-red-600 bg-red-50" },
              { label: "Refunds (30d)", value: zar(paymentsSnapshot?.refunds30dZar ?? 0), icon: CreditCard, iconColor: "text-slate-600 bg-slate-100" },
            ].map((p) => {
              const PIcon = p.icon;
              return (
                <div key={p.label} className="rounded-xl bg-slate-50 p-3">
                  <div className={cn("mb-2 flex h-7 w-7 items-center justify-center rounded-lg", p.iconColor)}>
                    <PIcon className="h-4 w-4" />
                  </div>
                  <p className="text-xs text-slate-500">{p.label}</p>
                  <p className="mt-0.5 text-base font-bold text-slate-800">{p.value}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Notifications Health */}
        <section className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Notifications health <span className="text-slate-400 font-normal">(Today)</span></h3>
            <Link href="/office/notification-logs" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              View logs <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Email", sent: emailSent, failed: emailFailed, icon: Mail, iconColor: "bg-blue-50 text-blue-600" },
              { label: "WhatsApp", sent: waSent, failed: waFailed, icon: MessageSquare, iconColor: "bg-emerald-50 text-emerald-600" },
              { label: "SMS", sent: smsSent, failed: smsFailed, icon: Bell, iconColor: "bg-violet-50 text-violet-600" },
            ].map((ch) => {
              const CIcon = ch.icon;
              const successRate = ch.sent + ch.failed > 0
                ? Math.round((ch.sent / (ch.sent + ch.failed)) * 100)
                : null;
              return (
                <div key={ch.label} className="rounded-xl bg-slate-50 p-3">
                  <div className={cn("mb-2 flex h-7 w-7 items-center justify-center rounded-lg", ch.iconColor)}>
                    <CIcon className="h-4 w-4" />
                  </div>
                  <p className="text-xs font-semibold text-slate-500">{ch.label}</p>
                  <p className="mt-0.5 text-xl font-bold text-slate-800">{ch.sent}</p>
                  <p className="text-[10px] text-slate-400">Delivered</p>
                  {successRate !== null ? (
                    <p className="text-[10px] text-emerald-600 font-semibold">{successRate}% success</p>
                  ) : (
                    <p className="text-[10px] text-slate-400">—</p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* ── Recent Activity + System Status ────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Recent Activity */}
        <section className="lg:col-span-2 rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800">Recent activity</h3>
            <Link href="/office/notification-logs" className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1">
              View all activity <ChevronRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="pb-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">Time</th>
                  <th className="pb-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">Activity</th>
                  <th className="pb-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400 hidden sm:table-cell">Details</th>
                  <th className="pb-2 text-left text-[11px] font-bold uppercase tracking-wide text-slate-400">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {recentActivity.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-xs text-slate-400">No recent activity found.</td>
                  </tr>
                ) : (
                  recentActivity.map((a, i) => (
                    <tr key={`${a.createdAt}-${a.type}-${i}`} className="group">
                      <td className="py-2.5 pr-3 text-xs font-mono text-slate-500">{formatActivityTime(a.createdAt)}</td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", severityDot(a.severity))} />
                          <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{a.type}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-slate-500 hidden sm:table-cell max-w-[220px] truncate">{a.details}</td>
                      <td className="py-2.5 text-xs text-slate-400">{a.user}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* System Status */}
        <section className="rounded-2xl bg-white border border-slate-100 p-5 shadow-sm">
          <h3 className="mb-4 text-sm font-bold text-slate-800">System status</h3>
          <div className="space-y-2.5">
            {systemChecks.map((s) => (
              <div key={s.name} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <s.icon className="h-4 w-4 text-slate-400" />
                  <span className="text-sm font-medium text-slate-700">{s.name}</span>
                </div>
                <div className="flex items-center gap-1">
                  {s.status ? (
                    <StatusBadge status={s.status} />
                  ) : (
                    <span className="text-xs font-medium text-slate-400">Checking…</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                </div>
              </div>
            ))}
          </div>
          {systemStatus?.productionHealth ? (
            <Link href="/office/ops-health" className="mt-3 block rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600 hover:bg-slate-100">
              <span className="font-semibold text-slate-800">
                {systemStatus.productionHealth.totalFindings ?? 0} production findings
              </span>
              {systemStatus.cronErrorsLast24h ? ` · ${systemStatus.cronErrorsLast24h} cron errors in 24h` : " · cron clean in 24h"}
            </Link>
          ) : null}
          <div className={cn(
            "mt-4 flex items-center justify-center gap-1.5 rounded-xl border py-2.5",
            loading && !stats
              ? "bg-slate-50 border-slate-100"
              : allSystemsOperational
                ? "bg-emerald-50 border-emerald-100"
                : "bg-orange-50 border-orange-100",
          )}>
            {loading && !stats ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
                <span className="text-xs font-semibold text-slate-500">Loading system status…</span>
              </>
            ) : allSystemsOperational ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-semibold text-emerald-700">All systems operational</span>
              </>
            ) : (
              <>
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-xs font-semibold text-orange-700">Some checks need attention</span>
              </>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
