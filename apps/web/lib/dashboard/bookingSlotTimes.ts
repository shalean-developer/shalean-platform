const TZ = "Africa/Johannesburg";

/** Default minimum lead time from “now” in Johannesburg before a same-day slot is bookable. */
export const BOOKING_MIN_LEAD_MINUTES = 120;

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

function hmToMinutes(hm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Wall-clock “now” in Johannesburg as date + minutes since midnight. */
export function johannesburgNowParts(now = new Date()): { ymd: string; minutes: number } {
  const ymd = now.toLocaleDateString("en-CA", { timeZone: TZ });
  const hm = now
    .toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false })
    .slice(0, 5);
  const minutes = hmToMinutes(hm) ?? 0;
  return { ymd, minutes };
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
  const now = opts?.now ?? new Date();
  const leadMinutes = opts?.leadMinutes ?? BOOKING_MIN_LEAD_MINUTES;
  const all = baseDaySlots();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return [];

  const { ymd: todayYmd, minutes: nowMin } = johannesburgNowParts(now);
  if (dateYmd > todayYmd) return all;
  if (dateYmd < todayYmd) return [];

  const minSlotMin = nowMin + leadMinutes;
  return all.filter((slot) => {
    const sm = hmToMinutes(slot);
    return sm != null && sm >= minSlotMin;
  });
}
