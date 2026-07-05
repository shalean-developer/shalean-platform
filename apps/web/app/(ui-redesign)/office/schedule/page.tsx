"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  MapPin,
  AlertTriangle,
  RefreshCw,
  AlertCircle,
  ChevronRight as ArrowRight,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdminData } from "@/hooks/useAdminData";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import {
  addOfficeScheduleDays,
  buildOfficeScheduleWeekStrip,
  computeOfficeScheduleCleanerStats,
  countOfficeScheduleStartingSoonUnassigned,
  filterOfficeScheduleBookings,
  formatOfficeScheduleLongDate,
  isOfficeScheduleToday,
  officeScheduleServiceLabel,
  officeScheduleStatusAccentClass,
  officeScheduleStatusClass,
  officeScheduleStatusPresentation,
  resolveOfficeScheduleSummary,
  type OfficeScheduleDayResponse,
  type OfficeScheduleFilter,
} from "@/lib/admin/officeScheduleDayPresentation";

const SCHEDULE_LIST_VISIBLE = 6;

const FILTER_OPTIONS: Array<{ id: OfficeScheduleFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "needs_action", label: "Unassigned" },
  { id: "assigned", label: "Assigned" },
  { id: "active", label: "In progress" },
];

export default function SchedulePage() {
  const [selectedDate, setSelectedDate] = useState(() => todayYmdJohannesburg());
  const [filter, setFilter] = useState<OfficeScheduleFilter>("all");
  const [showAllBookings, setShowAllBookings] = useState(false);

  const { data, loading, error, refetch } = useAdminData<OfficeScheduleDayResponse>(
    "/api/admin/schedule/day",
    { params: { date: selectedDate } },
  );

  const bookings = data?.bookings ?? [];
  const summary = useMemo(
    () => resolveOfficeScheduleSummary(bookings, data?.summary),
    [bookings, data?.summary],
  );
  const cleanerStats = useMemo(
    () => computeOfficeScheduleCleanerStats({ bookings, cleaners: data?.cleaners ?? [], dateYmd: selectedDate }),
    [bookings, data?.cleaners, selectedDate],
  );
  const startingSoonUnassigned = useMemo(
    () => countOfficeScheduleStartingSoonUnassigned(bookings, selectedDate),
    [bookings, selectedDate],
  );
  const weekStrip = useMemo(() => buildOfficeScheduleWeekStrip(selectedDate), [selectedDate]);
  const filteredBookings = useMemo(() => filterOfficeScheduleBookings(bookings, filter), [bookings, filter]);
  const visibleBookings = showAllBookings ? filteredBookings : filteredBookings.slice(0, SCHEDULE_LIST_VISIBLE);
  const hiddenBookingCount = Math.max(0, filteredBookings.length - SCHEDULE_LIST_VISIBLE);
  const isToday = isOfficeScheduleToday(selectedDate);

  const selectDate = (ymd: string) => {
    setSelectedDate(ymd);
    setShowAllBookings(false);
  };

  const selectFilter = (next: OfficeScheduleFilter) => {
    setFilter(next);
    setShowAllBookings(false);
  };

  return (
    <div className="space-y-4">
      {/* Command bar */}
      <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">Day schedule</h1>
              {isToday ? (
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                  Live
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{formatOfficeScheduleLongDate(selectedDate)}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={loading}
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
              aria-label="Refresh schedule"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
            <Link
              href="/office/bookings"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50"
            >
              All bookings
            </Link>
          </div>
        </div>

        {/* Week strip */}
        <div className="mt-4 flex items-center gap-1">
          <button
            type="button"
            onClick={() => selectDate(addOfficeScheduleDays(selectedDate, -7))}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-600"
            aria-label="Previous week"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="grid flex-1 grid-cols-7 gap-1">
            {weekStrip.map((day) => {
              const selected = day.ymd === selectedDate;
              const dayIsToday = isOfficeScheduleToday(day.ymd);
              return (
                <button
                  key={day.ymd}
                  type="button"
                  onClick={() => selectDate(day.ymd)}
                  className={cn(
                    "flex flex-col items-center rounded-xl px-1 py-2 transition-colors",
                    selected
                      ? "bg-blue-600 text-white shadow-md shadow-blue-600/20"
                      : "text-slate-600 hover:bg-white",
                  )}
                >
                  <span className={cn("text-[10px] font-medium uppercase", selected ? "text-blue-100" : "text-slate-400")}>
                    {day.weekdayLabel}
                  </span>
                  <span className="text-sm font-bold tabular-nums">{day.dayNum}</span>
                  {dayIsToday && !selected ? <span className="mt-0.5 h-1 w-1 rounded-full bg-blue-500" /> : null}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => selectDate(addOfficeScheduleDays(selectedDate, 7))}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-white hover:text-slate-600"
            aria-label="Next week"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday ? (
            <button
              type="button"
              onClick={() => selectDate(todayYmdJohannesburg())}
              className="ml-1 shrink-0 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100"
            >
              Today
            </button>
          ) : null}
        </div>

        {/* Inline stats */}
        <div className="mt-4 flex flex-wrap gap-2">
          {[
            { label: "Total", value: summary.total, cls: "bg-slate-900 text-white" },
            { label: "Done", value: summary.completed, cls: "bg-emerald-100 text-emerald-800" },
            { label: "Active", value: summary.inProgress, cls: "bg-violet-100 text-violet-800" },
            { label: "Upcoming", value: summary.upcoming, cls: "bg-blue-100 text-blue-800" },
            {
              label: "Unassigned",
              value: summary.unassigned,
              cls: summary.unassigned > 0 ? "bg-orange-100 text-orange-800 ring-1 ring-orange-200" : "bg-slate-100 text-slate-600",
            },
          ].map((s) => (
            <div key={s.label} className={cn("flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold", s.cls)}>
              <span className="opacity-80">{s.label}</span>
              <span className="tabular-nums">{loading && !data ? "—" : s.value}</span>
            </div>
          ))}
        </div>
      </div>

      {error ? (
        <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <AlertCircle className="h-5 w-5 shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
          <button type="button" onClick={() => void refetch()} className="ml-auto text-xs font-semibold text-red-600 hover:underline">
            Retry
          </button>
        </div>
      ) : null}

      {startingSoonUnassigned > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-sm text-orange-900">
          <AlertTriangle className="h-4 w-4 shrink-0 text-orange-600" />
          <p className="flex-1 text-xs sm:text-sm">
            <span className="font-semibold">{startingSoonUnassigned}</span> job(s) start within 2 hours with no cleaner.
          </p>
          <button
            type="button"
            onClick={() => selectFilter("needs_action")}
            className="rounded-lg bg-orange-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-orange-700"
          >
            Filter unassigned
          </button>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_280px]">
        {/* Agenda timeline */}
        <section className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-blue-600" />
              <p className="text-sm font-bold text-slate-800">Agenda</p>
              <span className="text-xs text-slate-400">({filteredBookings.length})</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {FILTER_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => selectFilter(opt.id)}
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    filter === opt.id ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {loading && !data ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: SCHEDULE_LIST_VISIBLE }).map((_, i) => (
                <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : filteredBookings.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-slate-500">No bookings match this view.</p>
              {filter !== "all" ? (
                <button type="button" onClick={() => selectFilter("all")} className="mt-2 text-xs font-semibold text-blue-600 hover:underline">
                  Clear filter
                </button>
              ) : (
                <p className="mt-1 text-xs text-slate-400">Nothing scheduled for this day.</p>
              )}
            </div>
          ) : (
            <div className="relative p-4">
              <div className="absolute bottom-4 left-[1.65rem] top-4 w-px bg-slate-200" aria-hidden />
              <div className="space-y-3">
                {visibleBookings.map((b) => (
                  <AgendaCard key={b.id} booking={b} />
                ))}
              </div>
              {hiddenBookingCount > 0 && !showAllBookings ? (
                <button
                  type="button"
                  onClick={() => setShowAllBookings(true)}
                  className="mt-4 w-full rounded-xl border border-dashed border-slate-200 py-2.5 text-xs font-semibold text-blue-600 hover:border-blue-200 hover:bg-blue-50/50"
                >
                  Show {hiddenBookingCount} more
                </button>
              ) : showAllBookings && filteredBookings.length > SCHEDULE_LIST_VISIBLE ? (
                <button
                  type="button"
                  onClick={() => setShowAllBookings(false)}
                  className="mt-4 w-full rounded-xl border border-slate-200 py-2.5 text-xs font-semibold text-slate-500 hover:bg-slate-50"
                >
                  Show less
                </button>
              ) : null}
            </div>
          )}
        </section>

        <aside className="space-y-4">
          <CleanerCapacityPanel stats={cleanerStats} loading={loading && !data} />
          <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Quick links</p>
            <div className="mt-3 space-y-1">
              {[
                { href: "/office/cleaners", label: "Manage cleaners" },
                { href: "/office/bookings", label: "Search bookings" },
                { href: "/office/recurring", label: "Recurring plans" },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="flex items-center justify-between rounded-lg px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {link.label}
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AgendaCard({ booking: b }: { booking: OfficeScheduleDayResponse["bookings"][number] }) {
  const { label, tone } = officeScheduleStatusPresentation(b);
  const isUnassigned = tone === "unassigned";

  return (
    <Link
      href={`/office/bookings/${b.id}`}
      className={cn(
        "group relative flex gap-3 rounded-xl border border-slate-100 border-l-4 py-3 pl-3 pr-4 shadow-sm transition-all hover:border-slate-200 hover:shadow-md",
        officeScheduleStatusAccentClass(tone, b.status),
      )}
    >
      <div className="relative z-10 flex w-10 shrink-0 flex-col items-center pt-0.5">
        <span className="rounded-full bg-white px-1 text-[11px] font-bold tabular-nums text-slate-700 ring-1 ring-slate-200">
          {b.time?.slice(0, 5) ?? "—:—"}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{officeScheduleServiceLabel(b)}</p>
            <p className="text-xs text-slate-500">{b.customer_name ?? "Customer"}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isUnassigned ? <AlertTriangle className="h-3.5 w-3.5 text-orange-500" /> : null}
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold capitalize", officeScheduleStatusClass(tone))}>
              {label}
            </span>
          </div>
        </div>
        <div className="mt-1.5 flex items-center gap-1 text-xs text-slate-500">
          <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
          <span className="truncate">{b.location ?? "No address"}</span>
        </div>
      </div>
      <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-blue-500" />
    </Link>
  );
}

function CleanerCapacityPanel({
  stats,
  loading,
}: {
  stats: ReturnType<typeof computeOfficeScheduleCleanerStats>;
  loading: boolean;
}) {
  const rows = [
    { label: "Available", count: stats.availableIdle, pct: stats.availablePct, color: "bg-emerald-500" },
    { label: "Booked / in job", count: stats.busy, pct: stats.busyPct, color: "bg-blue-500" },
    { label: "Off today", count: stats.offToday, pct: stats.offTodayPct, color: "bg-amber-300" },
    {
      label: "Offline / paused",
      count: stats.manuallyUnavailable,
      pct: stats.manuallyUnavailablePct,
      color: "bg-slate-300",
    },
  ];

  return (
    <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-bold text-slate-800">Cleaner capacity</h3>
        </div>
        <Link href="/office/cleaners" className="text-[11px] font-semibold text-blue-600 hover:underline">
          View all
        </Link>
      </div>
      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-slate-100" />
      ) : (
        <>
          <p className="mb-3 text-2xl font-bold tabular-nums text-slate-900">
            {stats.total}
            <span className="ml-1 text-sm font-normal text-slate-400">on roster</span>
          </p>
          <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
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
