import { format, parse } from "date-fns";

/** Same-day booking window for quote widgets (local time). */
export const BOOKING_SLOT_START_HOUR = 7;
export const BOOKING_SLOT_END_HOUR = 18;
export const BOOKING_SLOT_END_MINUTE = 30;
export const BOOKING_SLOT_INTERVAL_MIN = 30;

const SLOT_END_TOTAL_MIN = BOOKING_SLOT_END_HOUR * 60 + BOOKING_SLOT_END_MINUTE;
const SLOT_START_TOTAL_MIN = BOOKING_SLOT_START_HOUR * 60;

/** Last minute of the public same-day booking window (18:30). */
export function bookingServiceDayEndMinutes(): number {
  return SLOT_END_TOTAL_MIN;
}

export function bookingSlotStartToMinutes(hm: string): number | null {
  const m = hm.trim().slice(0, 5).match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Longest job (minutes) that can start at the first slot and finish same day. */
export function bookingMaxSameDayJobMinutesFromFirstSlot(): number {
  return bookingServiceDayEndMinutes() - SLOT_START_TOTAL_MIN;
}

/**
 * Minutes of work used to test cleaner availability for a slot start time.
 * Caps inflated quote durations so the public slot grid still surfaces bookable starts.
 * Returns null when fewer than 30 minutes remain in the service day.
 */
export function bookingSlotEligibilityDurationMinutes(
  slotStartMinutes: number,
  jobDurationMinutes: number,
): number | null {
  const remaining = bookingServiceDayEndMinutes() - slotStartMinutes;
  if (remaining < 30) return null;
  const cappedJob = Math.min(
    Math.max(30, Math.round(jobDurationMinutes)),
    bookingMaxSameDayJobMinutesFromFirstSlot(),
  );
  return Math.min(cappedJob, remaining);
}

/** All slots from 07:00 … 18:30 in 30-minute steps (independent of date). */
export function generateBookingTimeSlots(): string[] {
  const slots: string[] = [];
  let totalM = BOOKING_SLOT_START_HOUR * 60;
  while (totalM <= SLOT_END_TOTAL_MIN) {
    const h = Math.floor(totalM / 60);
    const m = totalM % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    totalM += BOOKING_SLOT_INTERVAL_MIN;
  }
  return slots;
}

export function parseBookingDay(dateYmd: string): Date {
  return parse(dateYmd, "yyyy-MM-dd", new Date());
}

export function formatBookingDayButtonLabel(dateYmd: string): string {
  return format(parseBookingDay(dateYmd), "EEE d MMM yyyy");
}

export function todayBookingYmd(now = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

/** Slots strictly after `now` on the given calendar day (local timezone). */
export function getAvailableBookingSlots(
  slots: readonly string[],
  dateYmd: string,
  now: Date = new Date(),
): string[] {
  const day = parseBookingDay(dateYmd);
  const y = day.getFullYear();
  const mon = day.getMonth();
  const d = day.getDate();
  return slots.filter((t) => {
    const [hh, mm] = t.split(":").map((x) => Number(x));
    const slotDt = new Date(y, mon, d, hh, mm, 0, 0);
    return slotDt > now;
  });
}

export function firstAvailableBookingSlot(dateYmd: string, now = new Date()): string | null {
  const row = getAvailableBookingSlots(generateBookingTimeSlots(), dateYmd, now);
  return row[0] ?? null;
}

/** First bookable slot for a day, or earliest defined slot as a safe fallback. */
export function defaultBookingTimeForDate(dateYmd: string, now = new Date()): string {
  return firstAvailableBookingSlot(dateYmd, now) ?? generateBookingTimeSlots()[0] ?? "07:00";
}
