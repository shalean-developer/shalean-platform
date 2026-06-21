import {
  CUSTOMER_ONLINE_BOOKING_TIME_SLOTS,
  filterCustomerOnlineBookingTimeSlots,
} from "@/lib/booking-v2/customerBookingTimeSlots";
import {
  BOOKING_MIN_LEAD_MINUTES,
  johannesburgNowParts,
} from "@/lib/booking/johannesburgBookingClock";

export { BOOKING_MIN_LEAD_MINUTES, johannesburgNowParts };

const TZ = "Africa/Johannesburg";

export function johannesburgTodayYmd(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: TZ });
}

/** `YYYY-MM` service bucket from a calendar date string. */
export function billingMonthFromYmd(ymd: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  return ymd.slice(0, 7);
}

function baseDaySlots(): string[] {
  const slots: string[] = [];
  for (let h = 7; h <= 19; h++) {
    for (const m of [0, 15, 30, 45]) {
      if (h === 19 && m > 0) break;
      slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    }
  }
  return slots;
}

/** Full business grid (07:00–19:00, 15-minute steps) for admin overrides and offline entry. */
export function allStandardDaySlots(): string[] {
  return baseDaySlots();
}

/**
 * Bookable time slots for `dateYmd` (YYYY-MM-DD), excluding impossible same-day times
 * (must be at least `leadMinutes` after “now” in Africa/Johannesburg when `dateYmd` is today).
 */
/** Calendar `YYYY-MM-DD` that is `deltaDays` after `fromYmd` (UTC date math; stable for “tomorrow” hints). */
export function addCalendarDaysToYmd(fromYmd: string, deltaDays: number): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fromYmd) || !Number.isFinite(deltaDays)) return fromYmd;
  const [y, m, d] = fromYmd.split("-").map(Number);
  const u = Date.UTC(y, m - 1, d + deltaDays);
  const dt = new Date(u);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Last calendar day of the same `YYYY-MM` month as `ymd`. */
export function lastYmdInSameMonthAs(ymd: string): string {
  const ym = billingMonthFromYmd(ymd);
  if (!ym) return ymd;
  const [y, M] = ym.split("-").map(Number);
  const last = new Date(y, M, 0);
  const yy = last.getFullYear();
  const mm = String(last.getMonth() + 1).padStart(2, "0");
  const dd = String(last.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function filterBookableTimeSlots(
  dateYmd: string,
  opts?: { now?: Date; leadMinutes?: number },
): string[] {
  return filterCustomerOnlineBookingTimeSlots(dateYmd, opts);
}

/** @deprecated Use {@link CUSTOMER_ONLINE_BOOKING_TIME_SLOTS} for customer-facing grids. */
export function customerOnlineBookingTimeSlots(): string[] {
  return [...CUSTOMER_ONLINE_BOOKING_TIME_SLOTS];
}
