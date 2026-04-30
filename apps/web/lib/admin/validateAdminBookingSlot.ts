import {
  BOOKING_MIN_LEAD_MINUTES,
  allStandardDaySlots,
  filterBookableTimeSlots,
  johannesburgTodayYmd,
} from "@/lib/dashboard/bookingSlotTimes";

export function isYmd(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function isHm(s: string): boolean {
  return /^\d{2}:\d{2}$/.test(s);
}

/**
 * Canonical slot time `HH:MM` (24h) for DB, idempotency, and duplicate checks.
 * Accepts `9:0`, `09:00`, `9:00:00`, etc.
 */
export function normalizeTimeHm(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  const m = t.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (m) {
    const h = Number.parseInt(m[1]!, 10);
    const min = Number.parseInt(m[2]!, 10);
    if (!Number.isFinite(h) || !Number.isFinite(min)) return t.length >= 5 && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : t;
    const hh = Math.min(23, Math.max(0, h));
    const mm = Math.min(59, Math.max(0, min));
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  }
  if (t.length >= 5 && /^\d{2}:\d{2}/.test(t)) return t.slice(0, 5);
  return t;
}

/**
 * Same rules as customer monthly self-serve: Johannesburg calendar, ≥2h lead on today, business slot list.
 */
export function assertAdminBookingSlotAllowed(params: {
  dateYmd: string;
  timeHm: string;
  now?: Date;
  /** Past dates, same-day short lead, and any business-hour slot (admin walk-ins / corrections). */
  adminSlotOverride?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const { dateYmd, timeHm, now = new Date(), adminSlotOverride = false } = params;
  if (!isYmd(dateYmd) || !isHm(timeHm)) {
    return { ok: false, error: "date (YYYY-MM-DD) and time (HH:MM) are required." };
  }
  if (adminSlotOverride) {
    const grid = allStandardDaySlots();
    if (!grid.includes(timeHm)) {
      return { ok: false, error: "Time must be on the standard 15-minute business grid (07:00–19:00 Johannesburg)." };
    }
    return { ok: true };
  }
  const todayJhb = johannesburgTodayYmd(now);
  if (dateYmd < todayJhb) {
    return { ok: false, error: "Booking date cannot be in the past (Johannesburg)." };
  }
  const bookableSlots = filterBookableTimeSlots(dateYmd, { now, leadMinutes: BOOKING_MIN_LEAD_MINUTES });
  if (dateYmd === todayJhb && bookableSlots.length === 0) {
    return {
      ok: false,
      error:
        "No bookable times remain today with the required notice. Pick tomorrow or a later date (Johannesburg time).",
    };
  }
  if (!bookableSlots.includes(timeHm)) {
    return {
      ok: false,
      error: `Choose a time at least ${BOOKING_MIN_LEAD_MINUTES / 60} hours from now (Johannesburg), within business hours.`,
    };
  }
  return { ok: true };
}
