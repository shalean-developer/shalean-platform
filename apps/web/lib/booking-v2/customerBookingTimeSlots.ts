import {
  BOOKING_MIN_LEAD_MINUTES,
  johannesburgNowParts,
} from "@/lib/dashboard/bookingSlotTimes";

/** Online self-serve booking window (08:00–12:30, 30-minute steps). */
export const CUSTOMER_ONLINE_BOOKING_TIME_SLOTS = [
  "08:00",
  "08:30",
  "09:00",
  "09:30",
  "10:00",
  "10:30",
  "11:00",
  "11:30",
  "12:00",
  "12:30",
] as const;

export const CUSTOMER_ONLINE_BOOKING_LAST_SLOT = "12:30";

function hmToMinutes(hm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

/** Display label for slot cards, e.g. `08:30` → `8:30 AM`. */
export function formatCustomerBookingSlotLabel(slot: string): string {
  const minutes = hmToMinutes(slot);
  if (minutes == null) return slot;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Bookable online slots for a calendar day — respects same-day lead time in Johannesburg.
 * After {@link CUSTOMER_ONLINE_BOOKING_LAST_SLOT}, customers must call to book.
 */
export function filterCustomerOnlineBookingTimeSlots(
  dateYmd: string,
  opts?: { now?: Date; leadMinutes?: number },
): string[] {
  const now = opts?.now ?? new Date();
  const leadMinutes = opts?.leadMinutes ?? BOOKING_MIN_LEAD_MINUTES;
  const all = [...CUSTOMER_ONLINE_BOOKING_TIME_SLOTS];
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

export function isCustomerOnlineBookingTimeSlot(time: string): boolean {
  const t = time.trim().slice(0, 5);
  return (CUSTOMER_ONLINE_BOOKING_TIME_SLOTS as readonly string[]).includes(t);
}
