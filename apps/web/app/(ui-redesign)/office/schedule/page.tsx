"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock,
  Plus,
  RefreshCw,
  UserCheck,
  Users,
  UserX,
} from "lucide-react";
import { OfficeScheduleCalendar } from "@/components/admin/office/OfficeScheduleCalendar";
import {
  OfficeZohoMetricCard,
  OfficeZohoMetricsRow,
  OfficeZohoPageHeader,
  OfficeZohoPillTabs,
  OfficeZohoSecondaryButton,
} from "@/components/admin/office/OfficeZohoChrome";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import {
  buildOfficeScheduleCleanersById,
  computeOfficeScheduleCleanerStats,
  countOfficeScheduleStartingSoonUnassigned,
  filterOfficeScheduleBookings,
  formatOfficeScheduleLongDate,
  getOfficeScheduleMonthRange,
  getOfficeScheduleWeekRange,
  isOfficeScheduleToday,
  navigateOfficeScheduleDate,
  resolveOfficeScheduleSummary,
  type OfficeScheduleCalendarView,
  type OfficeScheduleDayBooking,
  type OfficeScheduleDayResponse,
  type OfficeScheduleFilter,
} from "@/lib/admin/officeScheduleDayPresentation";

type RangeBookingsResponse = {
  bookings: Array<{
    id: string;
    date: string | null;
    time: string | null;
    status: string | null;
    cleaner_id: string | null;
    selected_cleaner_id: string | null;
    team_id: string | null;
    is_team_job?: boolean | null;
    customer_name: string | null;
    service: string | null;
    service_slug?: string | null;
    location: string | null;
    dispatch_status: string | null;
    booking_cleaners?: Array<{ cleaner_id: string; full_name: string | null; role: string }>;
  }>;
};

const FILTER_TABS: Array<{ key: OfficeScheduleFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "needs_action", label: "Unassigned" },
  { key: "assigned", label: "Assigned" },
  { key: "active", label: "In progress" },
];

function mapRangeBooking(row: RangeBookingsResponse["bookings"][number]): OfficeScheduleDayBooking {
  return {
    id: row.id,
    date: row.date,
    time: row.time,
    status: row.status,
    cleaner_id: row.cleaner_id,
    selected_cleaner_id: row.selected_cleaner_id,
    team_id: row.team_id,
    is_team_job: row.is_team_job,
    customer_name: row.customer_name,
    service: row.service,
    service_slug: row.service_slug,
    location: row.location,
    dispatch_status: row.dispatch_status,
    booking_cleaners: row.booking_cleaners,
  };
}

function rangeForView(view: OfficeScheduleCalendarView, selectedDate: string): { from: string; to: string } {
  if (view === "week") return getOfficeScheduleWeekRange(selectedDate);
  return getOfficeScheduleMonthRange(selectedDate);
}

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(() => todayYmdJohannesburg());
  const [view, setView] = useState<OfficeScheduleCalendarView>("month");
  const [filter, setFilter] = useState<OfficeScheduleFilter>("all");

  const range = useMemo(() => rangeForView(view, selectedDate), [view, selectedDate]);
  const needsRange = view !== "day";

  const { data: dayData, loading: dayLoading, error: dayError, refetch: refetchDay } =
    useAdminData<OfficeScheduleDayResponse>("/api/admin/schedule/day", { params: { date: selectedDate } });

  const { data: rangeData, loading: rangeLoading, error: rangeError, refetch: refetchRange } =
    useAdminData<RangeBookingsResponse>("/api/admin/bookings", {
      params: { from: range.from, to: range.to, filter: "all" },
      enabled: needsRange,
    });

  const rawCalendarBookings = useMemo(() => {
    if (view === "day") return dayData?.bookings ?? [];
    return (rangeData?.bookings ?? []).map(mapRangeBooking);
  }, [view, dayData?.bookings, rangeData?.bookings]);

  const calendarBookings = useMemo(
    () => filterOfficeScheduleBookings(rawCalendarBookings, filter),
    [rawCalendarBookings, filter],
  );

  const filterCounts = useMemo(
    () => ({
      all: rawCalendarBookings.length,
      needs_action: filterOfficeScheduleBookings(rawCalendarBookings, "needs_action").length,
      assigned: filterOfficeScheduleBookings(rawCalendarBookings, "assigned").length,
      active: filterOfficeScheduleBookings(rawCalendarBookings, "active").length,
    }),
    [rawCalendarBookings],
  );

  const summary = useMemo(
    () => resolveOfficeScheduleSummary(dayData?.bookings ?? [], dayData?.summary),
    [dayData?.bookings, dayData?.summary],
  );

  const cleanerStats = useMemo(
    () =>
      computeOfficeScheduleCleanerStats({
        bookings: dayData?.bookings ?? [],
        cleaners: dayData?.cleaners ?? [],
        dateYmd: selectedDate,
      }),
    [dayData?.bookings, dayData?.cleaners, selectedDate],
  );

  const cleanersById = useMemo(
    () => buildOfficeScheduleCleanersById(dayData?.cleaners ?? []),
    [dayData?.cleaners],
  );

  const startingSoonUnassigned = useMemo(
    () => countOfficeScheduleStartingSoonUnassigned(dayData?.bookings ?? [], selectedDate),
    [dayData?.bookings, selectedDate],
  );

  const loading = view === "day" ? dayLoading : dayLoading || rangeLoading;
  const error = dayError ?? (needsRange ? rangeError : null);
  const isToday = isOfficeScheduleToday(selectedDate);

  const refetch = useCallback(() => {
    void refetchDay();
    if (needsRange) void refetchRange();
  }, [refetchDay, refetchRange, needsRange]);

  useEffect(() => {
    const onChange = () => refetch();
    window.addEventListener("office:booking-change", onChange);
    return () => window.removeEventListener("office:booking-change", onChange);
  }, [refetch]);

  const handleViewChange = (next: OfficeScheduleCalendarView) => {
    setView(next);
    if (next === "day" && view !== "day") {
      // keep selectedDate
    }
  };

  const handleNavigate = (direction: -1 | 1) => {
    setSelectedDate((prev) => navigateOfficeScheduleDate(prev, view, direction));
  };

  return (
    <div className="space-y-4">
      <OfficeZohoPageHeader
        title="Schedule"
        subtitle={formatOfficeScheduleLongDate(selectedDate)}
        live={isToday}
        actions={
          <>
            <OfficeZohoSecondaryButton onClick={() => void refetch()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </OfficeZohoSecondaryButton>
            <Link
              href="/office/bookings"
              className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <BookOpen className="h-4 w-4" />
              All bookings
            </Link>
            <Link
              href="/office/bookings/create"
              className="inline-flex items-center gap-2 rounded-md bg-[var(--sidebar-active)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-95"
            >
              <Plus className="h-4 w-4" />
              New booking
            </Link>
          </>
        }
      />

      <OfficeZohoMetricsRow
        meta={
          isToday ? (
            <span className="inline-flex items-center gap-1.5 text-emerald-700">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              Live schedule
            </span>
          ) : (
            <span className="text-slate-400">Viewing {formatOfficeScheduleLongDate(selectedDate)}</span>
          )
        }
      >
        <OfficeZohoMetricCard icon={CalendarDays} label="Total today" value={loading && !dayData ? "—" : summary.total} />
        <OfficeZohoMetricCard
          icon={UserCheck}
          iconClassName="bg-emerald-50 text-emerald-600"
          label="Completed"
          value={loading && !dayData ? "—" : summary.completed}
        />
        <OfficeZohoMetricCard
          icon={Clock}
          iconClassName="bg-violet-50 text-violet-600"
          label="In progress"
          value={loading && !dayData ? "—" : summary.inProgress}
        />
        <OfficeZohoMetricCard
          icon={UserX}
          iconClassName={summary.unassigned > 0 ? "bg-orange-50 text-orange-600" : undefined}
          label="Unassigned"
          value={loading && !dayData ? "—" : summary.unassigned}
          active={summary.unassigned > 0}
          onClick={summary.unassigned > 0 ? () => setFilter("needs_action") : undefined}
        />
      </OfficeZohoMetricsRow>

      {error ? (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      ) : null}

      {startingSoonUnassigned > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" />
          <p className="flex-1 text-xs sm:text-sm">
            <span className="font-semibold">{startingSoonUnassigned}</span> job(s) start within 2 hours with no cleaner assigned.
          </p>
          <button
            type="button"
            onClick={() => setFilter("needs_action")}
            className="rounded-md bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-orange-700"
          >
            Show unassigned
          </button>
        </div>
      ) : null}

      <OfficeZohoPillTabs
        tabs={FILTER_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          count: filterCounts[tab.key],
        }))}
        activeKey={filter}
        onChange={(key) => setFilter(key as OfficeScheduleFilter)}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <OfficeScheduleCalendar
          view={view}
          selectedDate={selectedDate}
          bookings={calendarBookings}
          cleanersById={cleanersById}
          loading={loading}
          onViewChange={handleViewChange}
          onDateChange={setSelectedDate}
          onNavigate={handleNavigate}
          onToday={() => setSelectedDate(todayYmdJohannesburg())}
        />

        <aside className="space-y-4">
          <CleanerCapacityPanel stats={cleanerStats} loading={dayLoading && !dayData} dateLabel={formatOfficeScheduleLongDate(selectedDate)} />
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quick links</p>
            <div className="mt-3 space-y-1">
              {[
                { href: "/office/cleaners", label: "Manage cleaners" },
                { href: "/office/bookings", label: "Search bookings" },
                { href: "/office/recurring", label: "Recurring plans" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {link.label}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function CleanerCapacityPanel({
  stats,
  loading,
  dateLabel,
}: {
  stats: ReturnType<typeof computeOfficeScheduleCleanerStats>;
  loading: boolean;
  dateLabel: string;
}) {
  const rows = [
    { label: "Available", count: stats.availableIdle, pct: stats.availablePct, color: "bg-emerald-500" },
    { label: "Booked / in job", count: stats.busy, pct: stats.busyPct, color: "bg-blue-500" },
    { label: "Off today", count: stats.offToday, pct: stats.offTodayPct, color: "bg-amber-300" },
    { label: "Offline / paused", count: stats.manuallyUnavailable, pct: stats.manuallyUnavailablePct, color: "bg-slate-300" },
  ];

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-800">Cleaner capacity</h3>
        </div>
        <Link href="/office/cleaners" className="text-[11px] font-semibold text-[#2c79ff] hover:underline">
          View all
        </Link>
      </div>
      <p className="mb-3 text-xs text-slate-500">{dateLabel}</p>
      {loading ? (
        <div className="h-32 animate-pulse rounded-md bg-slate-100" />
      ) : (
        <>
          <p className="mb-3 text-2xl font-bold tabular-nums text-slate-900">
            {stats.total}
            <span className="ml-1 text-sm font-normal text-slate-400">on roster</span>
          </p>
          <div className="mb-4 flex h-2 overflow-hidden rounded-full bg-slate-100">
            {rows.map((row) =>
              row.pct > 0 ? (
                <div key={row.label} className={cn("h-full", row.color)} style={{ width: `${row.pct}%` }} title={row.label} />
              ) : null,
            )}
          </div>
          <div className="space-y-2">
            {rows.map((row) => (
              <div key={row.label} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-slate-600">
                  <span className={cn("h-2 w-2 rounded-full", row.color)} />
                  {row.label}
                </div>
                <span className="font-bold tabular-nums text-slate-800">{row.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
