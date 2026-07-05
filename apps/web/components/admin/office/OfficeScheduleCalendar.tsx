"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Lock, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  buildOfficeScheduleMonthGrid,
  buildOfficeScheduleTimelineHours,
  buildOfficeScheduleWeekDays,
  formatOfficeScheduleDayTitle,
  formatOfficeScheduleHourLabel,
  formatOfficeScheduleListDateHeader,
  formatOfficeScheduleMonthTitle,
  formatOfficeScheduleTimeRange,
  formatOfficeScheduleWeekTitle,
  groupOfficeScheduleBookingsByDate,
  isOfficeScheduleToday,
  officeScheduleAssignedCleanerLabel,
  officeScheduleEventBarClass,
  officeScheduleServiceLabel,
  officeScheduleStatusPresentation,
  parseOfficeScheduleTimeMinutes,
  type OfficeScheduleCalendarView,
  type OfficeScheduleDayBooking,
} from "@/lib/admin/officeScheduleDayPresentation";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const VIEW_OPTIONS: Array<{ key: OfficeScheduleCalendarView; label: string }> = [
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
  { key: "day", label: "Day" },
  { key: "list", label: "List" },
];

type OfficeScheduleCalendarProps = {
  view: OfficeScheduleCalendarView;
  selectedDate: string;
  bookings: OfficeScheduleDayBooking[];
  cleanersById: Map<string, string | null>;
  loading?: boolean;
  onViewChange: (view: OfficeScheduleCalendarView) => void;
  onDateChange: (ymd: string) => void;
  onNavigate: (direction: -1 | 1) => void;
  onToday: () => void;
};

export function OfficeScheduleCalendar({
  view,
  selectedDate,
  bookings,
  cleanersById,
  loading,
  onViewChange,
  onDateChange,
  onNavigate,
  onToday,
}: OfficeScheduleCalendarProps) {
  const weekDays = useMemo(() => buildOfficeScheduleWeekDays(selectedDate), [selectedDate]);
  const bookingsByDate = useMemo(() => groupOfficeScheduleBookingsByDate(bookings), [bookings]);

  const title = useMemo(() => {
    if (view === "month" || view === "list") return formatOfficeScheduleMonthTitle(selectedDate);
    if (view === "week") return formatOfficeScheduleWeekTitle(weekDays[0]!, weekDays[6]!);
    return formatOfficeScheduleDayTitle(selectedDate);
  }, [view, selectedDate, weekDays]);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onNavigate(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Previous"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onNavigate(1)}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Next"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onToday}
            className="ml-1 rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Today
          </button>
        </div>

        <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>

        <div className="flex overflow-hidden rounded-md border border-slate-200">
          {VIEW_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => onViewChange(opt.key)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium capitalize transition",
                view === opt.key
                  ? "bg-[var(--sidebar-active)] text-white"
                  : "bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      {loading ? (
        <CalendarSkeleton view={view} />
      ) : view === "month" ? (
        <MonthView
          anchorYmd={selectedDate}
          bookingsByDate={bookingsByDate}
          onDateChange={onDateChange}
          onViewChange={onViewChange}
        />
      ) : view === "week" ? (
        <WeekView weekDays={weekDays} bookingsByDate={bookingsByDate} cleanersById={cleanersById} />
      ) : view === "day" ? (
        <DayView
          dateYmd={selectedDate}
          bookings={bookingsByDate.get(selectedDate) ?? []}
          cleanersById={cleanersById}
        />
      ) : (
        <ListView anchorYmd={selectedDate} bookingsByDate={bookingsByDate} cleanersById={cleanersById} />
      )}
    </div>
  );
}

function CalendarSkeleton({ view }: { view: OfficeScheduleCalendarView }) {
  if (view === "month" || view === "week") {
    return <div className="h-[480px] animate-pulse bg-slate-50" />;
  }
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-md bg-slate-100" />
      ))}
    </div>
  );
}

function ScheduleEventBar({
  booking,
  compact,
}: {
  booking: OfficeScheduleDayBooking;
  compact?: boolean;
}) {
  const { tone } = officeScheduleStatusPresentation(booking);
  const title = officeScheduleServiceLabel(booking);
  const isUnassigned = tone === "unassigned";

  return (
    <Link
      href={`/office/bookings/${booking.id}`}
      className={cn(
        "group flex items-center gap-1.5 rounded px-2 py-0.5 text-white transition",
        compact ? "text-[11px] leading-tight" : "text-xs",
        officeScheduleEventBarClass(tone, booking.status),
      )}
      title={title}
    >
      {isUnassigned ? (
        <AlertTriangle className="h-3 w-3 shrink-0 opacity-90" />
      ) : (
        <Lock className="h-3 w-3 shrink-0 opacity-80" />
      )}
      <span className="truncate font-medium">{title}</span>
    </Link>
  );
}

function MonthView({
  anchorYmd,
  bookingsByDate,
  onDateChange,
  onViewChange,
}: {
  anchorYmd: string;
  bookingsByDate: Map<string, OfficeScheduleDayBooking[]>;
  onDateChange: (ymd: string) => void;
  onViewChange: (view: OfficeScheduleCalendarView) => void;
}) {
  const grid = useMemo(() => buildOfficeScheduleMonthGrid(anchorYmd), [anchorYmd]);

  return (
    <div>
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
        {WEEKDAY_LABELS.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-semibold uppercase text-slate-500">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {grid.map((cell) => {
          const dayBookings = bookingsByDate.get(cell.ymd) ?? [];
          const visible = dayBookings.slice(0, 3);
          const hidden = dayBookings.length - visible.length;
          return (
            <div
              key={cell.ymd}
              className={cn(
                "min-h-[100px] border-b border-r border-slate-100 p-1.5 last:border-r-0",
                !cell.inMonth && "bg-slate-50/60",
                cell.isToday && "bg-amber-50/40",
              )}
            >
              <button
                type="button"
                onClick={() => {
                  onDateChange(cell.ymd);
                  onViewChange("day");
                }}
                className={cn(
                  "mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  cell.isToday
                    ? "bg-[var(--sidebar-active)] text-white"
                    : cell.inMonth
                      ? "text-slate-700 hover:bg-slate-100"
                      : "text-slate-400 hover:bg-slate-100",
                )}
              >
                {cell.dayNum}
              </button>
              <div className="space-y-0.5">
                {visible.map((b) => (
                  <ScheduleEventBar key={b.id} booking={b} compact />
                ))}
                {hidden > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDateChange(cell.ymd);
                      onViewChange("day");
                    }}
                    className="px-1 text-[10px] font-semibold text-[#2c79ff] hover:underline"
                  >
                    +{hidden} more
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  weekDays,
  bookingsByDate,
  cleanersById,
}: {
  weekDays: string[];
  bookingsByDate: Map<string, OfficeScheduleDayBooking[]>;
  cleanersById: Map<string, string | null>;
}) {
  const allWeekBookings = useMemo(
    () => weekDays.flatMap((ymd) => bookingsByDate.get(ymd) ?? []),
    [weekDays, bookingsByDate],
  );
  const hours = useMemo(() => buildOfficeScheduleTimelineHours(allWeekBookings), [allWeekBookings]);
  const hourNumbers = useMemo(() => hours.map((h) => Number(h.slice(0, 2))), [hours]);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-200">
          <div className="border-r border-slate-100" />
          {weekDays.map((ymd) => {
            const d = new Date(`${ymd}T12:00:00+02:00`);
            const isToday = isOfficeScheduleToday(ymd);
            return (
              <div
                key={ymd}
                className={cn(
                  "border-r border-slate-100 px-2 py-2 text-center last:border-r-0",
                  isToday && "bg-amber-50/50",
                )}
              >
                <p className="text-xs font-medium text-slate-500">
                  {d.toLocaleDateString("en-ZA", { weekday: "short" })}
                </p>
                <p className={cn("text-sm font-semibold tabular-nums", isToday ? "text-[var(--sidebar-active)]" : "text-slate-800")}>
                  {d.getDate()}
                </p>
              </div>
            );
          })}
        </div>

        {/* All-day row */}
        <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-100">
          <div className="border-r border-slate-100 px-2 py-2 text-right text-[10px] text-slate-400">all-day</div>
          {weekDays.map((ymd) => {
            const dayBookings = (bookingsByDate.get(ymd) ?? []).filter((b) => !parseOfficeScheduleTimeMinutes(b.time));
            return (
              <div key={ymd} className="min-h-[32px] border-r border-slate-100 p-1 last:border-r-0">
                {dayBookings.map((b) => (
                  <ScheduleEventBar key={b.id} booking={b} compact />
                ))}
              </div>
            );
          })}
        </div>

        {/* Hourly grid */}
        {hourNumbers.map((hour) => (
          <div key={hour} className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-slate-50">
            <div className="border-r border-slate-100 px-2 py-3 text-right text-[10px] text-slate-400">
              {formatOfficeScheduleHourLabel(hour)}
            </div>
            {weekDays.map((ymd) => {
              const isToday = isOfficeScheduleToday(ymd);
              const dayBookings = (bookingsByDate.get(ymd) ?? []).filter((b) => {
                const mins = parseOfficeScheduleTimeMinutes(b.time);
                return mins != null && Math.floor(mins / 60) === hour;
              });
              return (
                <div
                  key={ymd}
                  className={cn(
                    "relative min-h-[48px] border-r border-slate-100 p-0.5 last:border-r-0",
                    isToday && "bg-amber-50/30",
                  )}
                >
                  {dayBookings.map((b) => (
                    <WeekEventBlock key={b.id} booking={b} cleanersById={cleanersById} />
                  ))}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function WeekEventBlock({
  booking,
  cleanersById,
}: {
  booking: OfficeScheduleDayBooking;
  cleanersById: Map<string, string | null>;
}) {
  const { tone } = officeScheduleStatusPresentation(booking);
  const mins = parseOfficeScheduleTimeMinutes(booking.time) ?? 0;
  const topPct = ((mins % 60) / 60) * 100;
  const title = officeScheduleServiceLabel(booking);
  const assigned = officeScheduleAssignedCleanerLabel(booking, cleanersById);

  return (
    <Link
      href={`/office/bookings/${booking.id}`}
      className={cn(
        "absolute inset-x-0.5 z-10 flex min-h-[36px] flex-col justify-center rounded px-1.5 py-1 text-white shadow-sm",
        officeScheduleEventBarClass(tone, booking.status),
      )}
      style={{ top: `${Math.min(topPct, 50)}%`, height: "calc(100% - 4px)" }}
      title={title}
    >
      <span className="flex items-center gap-1 truncate text-[11px] font-semibold">
        <Lock className="h-2.5 w-2.5 shrink-0 opacity-80" />
        {title}
      </span>
      {assigned ? <span className="truncate text-[10px] opacity-90">{assigned}</span> : null}
    </Link>
  );
}

function DayView({
  dateYmd,
  bookings,
  cleanersById,
}: {
  dateYmd: string;
  bookings: OfficeScheduleDayBooking[];
  cleanersById: Map<string, string | null>;
}) {
  const hours = useMemo(() => buildOfficeScheduleTimelineHours(bookings), [bookings]);
  const hourNumbers = useMemo(() => hours.map((h) => Number(h.slice(0, 2))), [hours]);
  const allDay = bookings.filter((b) => !parseOfficeScheduleTimeMinutes(b.time));
  const d = new Date(`${dateYmd}T12:00:00+02:00`);

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[400px]">
        <div className="border-b border-slate-200 bg-amber-50/40 px-4 py-3 text-center">
          <p className="text-sm font-semibold text-slate-800">
            {d.toLocaleDateString("en-ZA", { weekday: "long" })}
          </p>
        </div>

        <div className="grid grid-cols-[56px_1fr] border-b border-slate-100">
          <div className="border-r border-slate-100 px-2 py-2 text-right text-[10px] text-slate-400">all-day</div>
          <div className="min-h-[40px] space-y-1 p-2">
            {allDay.map((b) => (
              <ScheduleEventBar key={b.id} booking={b} />
            ))}
          </div>
        </div>

        {hourNumbers.map((hour) => {
          const hourBookings = bookings.filter((b) => {
            const mins = parseOfficeScheduleTimeMinutes(b.time);
            return mins != null && Math.floor(mins / 60) === hour;
          });
          return (
            <div key={hour} className="grid grid-cols-[56px_1fr] border-b border-slate-50">
              <div className="border-r border-slate-100 px-2 py-4 text-right text-[10px] text-slate-400">
                {formatOfficeScheduleHourLabel(hour)}
              </div>
              <div className="relative min-h-[56px] bg-amber-50/20 p-1">
                {hourBookings.map((b) => (
                  <DayEventBlock key={b.id} booking={b} cleanersById={cleanersById} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DayEventBlock({
  booking,
  cleanersById,
}: {
  booking: OfficeScheduleDayBooking;
  cleanersById: Map<string, string | null>;
}) {
  const { tone } = officeScheduleStatusPresentation(booking);
  const mins = parseOfficeScheduleTimeMinutes(booking.time) ?? 0;
  const topPct = ((mins % 60) / 60) * 100;
  const title = officeScheduleServiceLabel(booking);
  const assigned = officeScheduleAssignedCleanerLabel(booking, cleanersById);

  return (
    <Link
      href={`/office/bookings/${booking.id}`}
      className={cn(
        "absolute inset-x-1 z-10 flex min-h-[44px] flex-col justify-center rounded px-2 py-1.5 text-white shadow-sm",
        officeScheduleEventBarClass(tone, booking.status),
      )}
      style={{ top: `${Math.min(topPct, 40)}%`, height: "calc(100% - 8px)" }}
    >
      <span className="flex items-center gap-1.5 text-sm font-semibold">
        <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" />
        {title}
      </span>
      {assigned ? <span className="mt-0.5 truncate text-xs opacity-90">{assigned}</span> : null}
    </Link>
  );
}

function ListView({
  anchorYmd,
  bookingsByDate,
  cleanersById,
}: {
  anchorYmd: string;
  bookingsByDate: Map<string, OfficeScheduleDayBooking[]>;
  cleanersById: Map<string, string | null>;
}) {
  const monthRange = useMemo(() => {
    const d = new Date(`${anchorYmd}T12:00:00+02:00`);
    const year = d.getFullYear();
    const month = d.getMonth();
    const days: string[] = [];
    const last = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= last; i++) {
      const cur = new Date(year, month, i);
      days.push(todayYmdJohannesburg(cur));
    }
    return days;
  }, [anchorYmd]);

  const datesWithBookings = monthRange.filter((ymd) => (bookingsByDate.get(ymd)?.length ?? 0) > 0);

  if (datesWithBookings.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-sm text-slate-500">No bookings scheduled this month.</p>
      </div>
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {datesWithBookings.map((ymd) => {
        const header = formatOfficeScheduleListDateHeader(ymd);
        const dayBookings = bookingsByDate.get(ymd) ?? [];
        return (
          <div key={ymd}>
            <div className="flex items-center justify-between bg-slate-50 px-4 py-2.5">
              <span className="text-sm font-semibold text-slate-800">{header.date}</span>
              <span className="text-sm text-slate-500">{header.weekday}</span>
            </div>
            <div className="space-y-2 px-4 py-3">
              {dayBookings.map((b) => (
                <ListEventRow key={b.id} booking={b} cleanersById={cleanersById} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ListEventRow({
  booking,
  cleanersById,
}: {
  booking: OfficeScheduleDayBooking;
  cleanersById: Map<string, string | null>;
}) {
  const { tone } = officeScheduleStatusPresentation(booking);
  const title = officeScheduleServiceLabel(booking);
  const assigned = officeScheduleAssignedCleanerLabel(booking, cleanersById);
  const dotColor =
    tone === "unassigned"
      ? "bg-orange-500"
      : tone === "completed"
        ? "bg-emerald-500"
        : tone === "in_progress"
          ? "bg-violet-500"
          : tone === "assigned"
            ? "bg-blue-500"
            : "bg-slate-400";

  return (
    <div className="flex items-start gap-3">
      <span className="w-28 shrink-0 pt-1 text-xs tabular-nums text-slate-500">
        {formatOfficeScheduleTimeRange(booking.time)}
      </span>
      <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dotColor)} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/office/bookings/${booking.id}`}
          className={cn(
            "block rounded-md px-3 py-2 text-white transition",
            officeScheduleEventBarClass(tone, booking.status),
          )}
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <Lock className="h-3.5 w-3.5 shrink-0 opacity-80" />
            {title}
          </span>
          {booking.customer_name ? (
            <span className="mt-0.5 block text-xs opacity-90">{booking.customer_name}</span>
          ) : null}
        </Link>
        {booking.location ? (
          <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">{booking.location}</span>
          </p>
        ) : null}
        {assigned ? (
          <p className="mt-0.5 text-xs font-medium text-slate-600">{assigned}</p>
        ) : null}
      </div>
    </div>
  );
}
