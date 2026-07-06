import { deriveCleanerAvailabilityState } from "@/lib/cleaner/cleanerAvailabilityState";
import {
  computeOfficeTodayScheduleStats,
  officeScheduleStatusPresentation,
  type OfficeScheduleBookingRow,
  type OfficeTodayScheduleStats,
} from "@/lib/admin/officeTodayScheduleStats";
import { todayYmdJohannesburg } from "@/lib/booking/dateInJohannesburg";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";

export type OfficeScheduleDayBooking = OfficeScheduleBookingRow & {
  id: string;
  date: string | null;
  time: string | null;
  customer_name: string | null;
  service: string | null;
  service_slug?: string | null;
  location: string | null;
  dispatch_status: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
  booking_cleaners?: readonly { cleaner_id: string; full_name: string | null; role: string }[] | null;
};

export type OfficeScheduleDayCleaner = {
  id: string;
  full_name: string | null;
  phone?: string | null;
  is_available: boolean | null;
  status?: string | null;
  availability_weekdays?: unknown;
};

export type OfficeScheduleDayResponse = {
  date: string;
  bookings: OfficeScheduleDayBooking[];
  cleaners: OfficeScheduleDayCleaner[];
  summary: OfficeTodayScheduleStats;
};

const STATUS_TONE_CLS: Record<string, string> = {
  unassigned: "bg-orange-100 text-orange-700",
  completed: "bg-emerald-100 text-emerald-700",
  in_progress: "bg-violet-100 text-violet-700",
  assigned: "bg-blue-100 text-blue-700",
  neutral: "bg-slate-100 text-slate-700",
};

export function officeScheduleStatusClass(tone: string): string {
  return STATUS_TONE_CLS[tone] ?? STATUS_TONE_CLS.neutral!;
}

const STATUS_ACCENT_CLS: Record<string, string> = {
  unassigned: "border-l-orange-500 bg-orange-50/40",
  completed: "border-l-emerald-500 bg-emerald-50/30",
  in_progress: "border-l-violet-500 bg-violet-50/30",
  assigned: "border-l-blue-500 bg-white",
  neutral: "border-l-slate-300 bg-white",
  cancelled: "border-l-red-300 bg-slate-50/80 opacity-75",
};

export function officeScheduleStatusAccentClass(tone: string, status?: string | null): string {
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "cancelled" || st === "failed") return STATUS_ACCENT_CLS.cancelled!;
  return STATUS_ACCENT_CLS[tone] ?? STATUS_ACCENT_CLS.neutral!;
}

export type OfficeScheduleFilter = "all" | "needs_action" | "active" | "assigned";

export function filterOfficeScheduleBookings(
  bookings: OfficeScheduleDayBooking[],
  filter: OfficeScheduleFilter,
): OfficeScheduleDayBooking[] {
  if (filter === "all") return bookings;
  return bookings.filter((b) => {
    const st = String(b.status ?? "").trim().toLowerCase();
    const { tone } = officeScheduleStatusPresentation(b);
    if (filter === "needs_action") return tone === "unassigned";
    if (filter === "active") return st === "in_progress" || st === "en_route";
    if (filter === "assigned") return tone === "assigned" || st === "confirmed";
    return true;
  });
}

export function buildOfficeScheduleWeekStrip(anchorYmd: string): Array<{
  ymd: string;
  weekdayLabel: string;
  dayNum: string;
}> {
  const anchor = new Date(`${anchorYmd}T12:00:00+02:00`);
  const day = anchor.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(anchor);
  monday.setDate(anchor.getDate() + mondayOffset);
  const out: Array<{ ymd: string; weekdayLabel: string; dayNum: string }> = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(monday);
    cur.setDate(monday.getDate() + i);
    const ymd = todayYmdJohannesburg(cur);
    out.push({
      ymd,
      weekdayLabel: cur.toLocaleDateString("en-ZA", { weekday: "short" }).slice(0, 2),
      dayNum: cur.toLocaleDateString("en-ZA", { day: "numeric" }),
    });
  }
  return out;
}

export function formatOfficeScheduleLongDate(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString("en-ZA", { weekday: "long", day: "numeric", month: "long" });
}

export function formatOfficeScheduleDateLabel(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

export function addOfficeScheduleDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  d.setDate(d.getDate() + days);
  return todayYmdJohannesburg(d);
}

export function isOfficeScheduleToday(ymd: string, now = new Date()): boolean {
  return ymd === todayYmdJohannesburg(now);
}

export function officeScheduleServiceLabel(row: Pick<OfficeScheduleDayBooking, "service" | "service_slug">): string {
  return serviceLabelFromBookingRow(row) ?? (row.service ?? "Service").replace(/-/g, " ");
}

export function resolveOfficeScheduleSummary(
  bookings: OfficeScheduleDayBooking[],
  summary?: OfficeTodayScheduleStats,
): OfficeTodayScheduleStats {
  return summary ?? computeOfficeTodayScheduleStats(bookings);
}

export function buildOfficeScheduleCleanersById(
  cleaners: readonly Pick<OfficeScheduleDayCleaner, "id" | "full_name">[],
): Map<string, string | null> {
  return new Map(cleaners.map((cleaner) => [cleaner.id, cleaner.full_name ?? null]));
}

function officeScheduleRosterCleanerIds(
  booking: Pick<OfficeScheduleDayBooking, "cleaner_id" | "selected_cleaner_id" | "booking_cleaners">,
): string[] {
  const fromRoster = (booking.booking_cleaners ?? [])
    .map((member) => String(member.cleaner_id ?? "").trim())
    .filter(Boolean);
  if (fromRoster.length > 0) return fromRoster;
  return [booking.cleaner_id, booking.selected_cleaner_id]
    .map((id) => String(id ?? "").trim())
    .filter(Boolean);
}

/** Display label for the cleaner (or team) assigned to a schedule booking. */
export function officeScheduleAssignedCleanerLabel(
  booking: Pick<
    OfficeScheduleDayBooking,
    "cleaner_id" | "selected_cleaner_id" | "team_id" | "booking_cleaners"
  >,
  cleanersById: ReadonlyMap<string, string | null>,
): string | null {
  if (String(booking.team_id ?? "").trim()) {
    return "Team assigned";
  }

  const roster = booking.booking_cleaners ?? [];
  if (roster.length > 0) {
    const names = roster.map((member) => {
      const fromRoster = member.full_name?.trim();
      if (fromRoster) return fromRoster;
      const fromLookup = cleanersById.get(member.cleaner_id)?.trim();
      return fromLookup || "Cleaner";
    });
    return names.join(", ");
  }

  const cleanerId = String(booking.cleaner_id ?? booking.selected_cleaner_id ?? "").trim();
  if (!cleanerId) return null;
  const name = cleanersById.get(cleanerId)?.trim();
  return name || "Assigned cleaner";
}

export function weekdayIndexForScheduleYmd(ymd: string): number {
  const day = new Date(`${ymd}T12:00:00+02:00`).getDay();
  return Number.isFinite(day) ? day : new Date().getDay();
}

export function rosterIncludesWeekdayForSchedule(raw: unknown, weekday: number): boolean {
  if (!Array.isArray(raw) || raw.length === 0) return true;
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return raw.some((value) => {
    const v = String(value ?? "").trim().toLowerCase();
    if (!v) return false;
    const asNumber = Number(v);
    if (Number.isFinite(asNumber)) return asNumber === weekday || asNumber === weekday + 1;
    return v === names[weekday] || v.startsWith(names[weekday]!);
  });
}

export function computeOfficeScheduleCleanerStats(params: {
  bookings: OfficeScheduleDayBooking[];
  cleaners: OfficeScheduleDayCleaner[];
  dateYmd: string;
}): {
  total: number;
  availableIdle: number;
  busy: number;
  /** Cleaners manually offline or paused — excluded from dispatch offers. */
  manuallyUnavailable: number;
  /** Cleaners online but today is not a roster day — schedule gate, not a manual opt-out. */
  offToday: number;
  /** @deprecated Use {@link manuallyUnavailable} + {@link offToday} for dashboard breakdown. */
  notReceiving: number;
  availablePct: number;
  busyPct: number;
  manuallyUnavailablePct: number;
  offTodayPct: number;
  /** Combined remainder (off today + manually unavailable). */
  offlinePct: number;
} {
  const activeCleanerIds = new Set(
    params.bookings
      .filter((b) => {
        const st = String(b.status ?? "").toLowerCase();
        return st === "in_progress" || st === "en_route";
      })
      .flatMap((b) => officeScheduleRosterCleanerIds(b)),
  );
  const bookedCleanerIds = new Set(
    params.bookings
      .filter((b) => {
        const st = String(b.status ?? "").toLowerCase();
        return (st === "assigned" || st === "confirmed") && officeScheduleRosterCleanerIds(b).length > 0;
      })
      .flatMap((b) => officeScheduleRosterCleanerIds(b)),
  );
  const weekday = weekdayIndexForScheduleYmd(params.dateYmd);
  const cleanerStates = params.cleaners.map((cleaner) =>
    deriveCleanerAvailabilityState({
      browserOnline: String(cleaner.status ?? "").toLowerCase() !== "offline",
      isAvailable: cleaner.is_available === true,
      rosterIncludesToday: rosterIncludesWeekdayForSchedule(cleaner.availability_weekdays, weekday),
      hasActiveJob: activeCleanerIds.has(cleaner.id),
      hasFutureBookedJob: bookedCleanerIds.has(cleaner.id),
    }),
  );
  const total = params.cleaners.length;
  const availableIdle = cleanerStates.filter((s) => s.stateKey === "online").length;
  const busy = cleanerStates.filter((s) => s.stateKey === "booked" || s.stateKey === "in-job").length;
  const offToday = cleanerStates.filter((s) => s.stateKey === "off-today").length;
  const manuallyUnavailable = cleanerStates.filter(
    (s) => s.stateKey === "paused" || s.stateKey === "offline",
  ).length;
  const notReceiving = offToday + manuallyUnavailable;
  const availablePct = total > 0 ? Math.round((availableIdle / total) * 1000) / 10 : 0;
  const busyPct = total > 0 ? Math.round((busy / total) * 1000) / 10 : 0;
  const offTodayPct = total > 0 ? Math.round((offToday / total) * 1000) / 10 : 0;
  const manuallyUnavailablePct = total > 0 ? Math.round((manuallyUnavailable / total) * 1000) / 10 : 0;
  const offlinePct = Math.max(0, 100 - availablePct - busyPct);
  return {
    total,
    availableIdle,
    busy,
    offToday,
    manuallyUnavailable,
    notReceiving,
    availablePct,
    busyPct,
    offTodayPct,
    manuallyUnavailablePct,
    offlinePct,
  };
}

export function countOfficeScheduleStartingSoonUnassigned(
  bookings: OfficeScheduleDayBooking[],
  dateYmd: string,
  now = new Date(),
): number {
  if (!isOfficeScheduleToday(dateYmd, now)) return 0;
  const nowMs = now.getTime();
  const windowEnd = nowMs + 2 * 60 * 60_000;
  return bookings.filter((b) => {
    const st = String(b.status ?? "").toLowerCase();
    if (st === "cancelled" || st === "failed" || st === "completed") return false;
    if (officeScheduleRosterCleanerIds(b).length > 0 || b.team_id) return false;
    const time = b.time?.slice(0, 5);
    if (!time) return false;
    const start = new Date(`${dateYmd}T${time}:00+02:00`).getTime();
    if (!Number.isFinite(start)) return false;
    return start >= nowMs && start <= windowEnd;
  }).length;
}

function parseBookingHour(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = time.trim().match(/^(\d{1,2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  return Number.isFinite(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

export function buildOfficeScheduleTimelineHours(bookings: OfficeScheduleDayBooking[]): string[] {
  const hours = new Set<number>();
  for (const booking of bookings) {
    const hour = parseBookingHour(booking.time);
    if (hour != null) hours.add(hour);
  }
  if (hours.size === 0) {
    return Array.from({ length: 11 }, (_, i) => `${String(7 + i).padStart(2, "0")}:00`);
  }
  const min = Math.max(6, Math.min(...hours) - 1);
  const max = Math.min(21, Math.max(...hours) + 1);
  const out: string[] = [];
  for (let h = min; h <= max; h++) out.push(`${String(h).padStart(2, "0")}:00`);
  return out;
}

export function bookingsInTimelineHour(bookings: OfficeScheduleDayBooking[], hourLabel: string): OfficeScheduleDayBooking[] {
  const hour = parseBookingHour(hourLabel);
  if (hour == null) return [];
  return bookings.filter((b) => parseBookingHour(b.time) === hour);
}

export type OfficeScheduleCalendarView = "month" | "week" | "day" | "list";

const EVENT_BAR_CLS: Record<string, string> = {
  unassigned: "bg-orange-500 hover:bg-orange-600",
  completed: "bg-emerald-500 hover:bg-emerald-600",
  in_progress: "bg-violet-500 hover:bg-violet-600",
  assigned: "bg-blue-500 hover:bg-blue-600",
  neutral: "bg-slate-500 hover:bg-slate-600",
  cancelled: "bg-slate-400 hover:bg-slate-500 opacity-75",
};

export function officeScheduleEventBarClass(tone: string, status?: string | null): string {
  const st = String(status ?? "").trim().toLowerCase();
  if (st === "cancelled" || st === "failed") return EVENT_BAR_CLS.cancelled!;
  return EVENT_BAR_CLS[tone] ?? EVENT_BAR_CLS.neutral!;
}

export function parseOfficeScheduleTimeMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function formatOfficeScheduleHourLabel(hour24: number): string {
  if (hour24 === 0) return "12am";
  if (hour24 < 12) return `${hour24}am`;
  if (hour24 === 12) return "12pm";
  return `${hour24 - 12}pm`;
}

export function formatOfficeScheduleTimeRange(time: string | null | undefined): string {
  const mins = parseOfficeScheduleTimeMinutes(time);
  if (mins == null) return "All day";
  const endMins = mins + 60;
  const fmt = (m: number) => {
    const h = Math.floor(m / 60) % 24;
    const min = m % 60;
    const suffix = h < 12 || h === 24 ? "am" : "pm";
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return min === 0 ? `${hour12}${suffix}` : `${hour12}:${String(min).padStart(2, "0")}${suffix}`;
  };
  return `${fmt(mins)} - ${fmt(endMins)}`;
}

export function formatOfficeScheduleMonthTitle(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
}

export function formatOfficeScheduleWeekTitle(startYmd: string, endYmd: string): string {
  const start = new Date(`${startYmd}T12:00:00+02:00`);
  const end = new Date(`${endYmd}T12:00:00+02:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return startYmd;
  const startMonth = start.toLocaleDateString("en-ZA", { month: "short" });
  const endMonth = end.toLocaleDateString("en-ZA", { month: "short" });
  const startDay = start.getDate();
  const endDay = end.getDate();
  const year = end.getFullYear();
  if (startMonth === endMonth) return `${startMonth} ${startDay} – ${endDay}, ${year}`;
  return `${startMonth} ${startDay} – ${endMonth} ${endDay}, ${year}`;
}

export function formatOfficeScheduleDayTitle(ymd: string): string {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  if (!Number.isFinite(d.getTime())) return ymd;
  return d.toLocaleDateString("en-ZA", { month: "long", day: "numeric", year: "numeric" });
}

export function formatOfficeScheduleListDateHeader(ymd: string): { date: string; weekday: string } {
  const d = new Date(`${ymd}T12:00:00+02:00`);
  if (!Number.isFinite(d.getTime())) return { date: ymd, weekday: "" };
  return {
    date: d.toLocaleDateString("en-ZA", { month: "long", day: "numeric", year: "numeric" }),
    weekday: d.toLocaleDateString("en-ZA", { weekday: "long" }),
  };
}

function startOfCalendarWeekSunday(ymd: string): Date {
  const anchor = new Date(`${ymd}T12:00:00+02:00`);
  const day = anchor.getDay();
  const sunday = new Date(anchor);
  sunday.setDate(anchor.getDate() - day);
  return sunday;
}

export function buildOfficeScheduleWeekDays(anchorYmd: string): string[] {
  const sunday = startOfCalendarWeekSunday(anchorYmd);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const cur = new Date(sunday);
    cur.setDate(sunday.getDate() + i);
    out.push(todayYmdJohannesburg(cur));
  }
  return out;
}

export function getOfficeScheduleWeekRange(anchorYmd: string): { from: string; to: string } {
  const days = buildOfficeScheduleWeekDays(anchorYmd);
  return { from: days[0]!, to: days[6]! };
}

export function getOfficeScheduleMonthRange(anchorYmd: string): { from: string; to: string } {
  const d = new Date(`${anchorYmd}T12:00:00+02:00`);
  const year = d.getFullYear();
  const month = d.getMonth();
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return { from: todayYmdJohannesburg(first), to: todayYmdJohannesburg(last) };
}

export function buildOfficeScheduleMonthGrid(anchorYmd: string): Array<{
  ymd: string;
  dayNum: number;
  inMonth: boolean;
  isToday: boolean;
}> {
  const d = new Date(`${anchorYmd}T12:00:00+02:00`);
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const gridStart = startOfCalendarWeekSunday(todayYmdJohannesburg(firstOfMonth));
  const today = todayYmdJohannesburg();
  const out: Array<{ ymd: string; dayNum: number; inMonth: boolean; isToday: boolean }> = [];
  for (let i = 0; i < 42; i++) {
    const cur = new Date(gridStart);
    cur.setDate(gridStart.getDate() + i);
    const ymd = todayYmdJohannesburg(cur);
    out.push({
      ymd,
      dayNum: cur.getDate(),
      inMonth: cur.getMonth() === month,
      isToday: ymd === today,
    });
  }
  return out;
}

export function groupOfficeScheduleBookingsByDate(
  bookings: readonly OfficeScheduleDayBooking[],
): Map<string, OfficeScheduleDayBooking[]> {
  const map = new Map<string, OfficeScheduleDayBooking[]>();
  for (const booking of bookings) {
    const date = String(booking.date ?? "").trim();
    if (!date) continue;
    const list = map.get(date) ?? [];
    list.push(booking);
    map.set(date, list);
  }
  for (const [, list] of map) {
    list.sort((a, b) => (a.time ?? "").localeCompare(b.time ?? ""));
  }
  return map;
}

export function navigateOfficeScheduleDate(
  ymd: string,
  view: OfficeScheduleCalendarView,
  direction: -1 | 1,
): string {
  if (view === "month" || view === "list") {
    const d = new Date(`${ymd}T12:00:00+02:00`);
    d.setMonth(d.getMonth() + direction);
    return todayYmdJohannesburg(d);
  }
  if (view === "week") return addOfficeScheduleDays(ymd, direction * 7);
  return addOfficeScheduleDays(ymd, direction);
}

export { officeScheduleStatusPresentation };
