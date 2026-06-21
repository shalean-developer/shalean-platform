import {
  BOOKING_MIN_LEAD_MINUTES,
  johannesburgNowParts,
} from "@/lib/booking/johannesburgBookingClock";
import type { BookingV2SchedulingConfig } from "@/lib/booking-v2/bookingV2CatalogTypes";

const DEFAULT_SCHEDULING: Pick<
  BookingV2SchedulingConfig,
  "leadMinutes" | "slotStartHour" | "slotEndHour" | "slotIntervalMinutes"
> = {
  leadMinutes: BOOKING_MIN_LEAD_MINUTES,
  slotStartHour: 8,
  slotEndHour: 12,
  slotIntervalMinutes: 30,
};

/** Build morning slot strings from catalog scheduling (last slot = end hour + :30). */
export function buildCustomerBookingTimeSlots(
  scheduling?: Partial<BookingV2SchedulingConfig>,
): string[] {
  const startHour = scheduling?.slotStartHour ?? DEFAULT_SCHEDULING.slotStartHour;
  const endHour = scheduling?.slotEndHour ?? DEFAULT_SCHEDULING.slotEndHour;
  const interval = scheduling?.slotIntervalMinutes ?? DEFAULT_SCHEDULING.slotIntervalMinutes;
  const slots: string[] = [];
  let minutes = startHour * 60;
  const lastMinutes = endHour * 60 + 30;
  while (minutes <= lastMinutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    minutes += interval;
  }
  return slots;
}

/** Online self-serve booking window (08:00–12:30, 30-minute steps). */
export const CUSTOMER_ONLINE_BOOKING_TIME_SLOTS = buildCustomerBookingTimeSlots() as readonly string[];

export const CUSTOMER_ONLINE_BOOKING_LAST_SLOT =
  CUSTOMER_ONLINE_BOOKING_TIME_SLOTS[CUSTOMER_ONLINE_BOOKING_TIME_SLOTS.length - 1] ?? "12:30";

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
  opts?: { now?: Date; leadMinutes?: number; scheduling?: Partial<BookingV2SchedulingConfig> },
): string[] {
  const now = opts?.now ?? new Date();
  const leadMinutes = opts?.leadMinutes ?? opts?.scheduling?.leadMinutes ?? BOOKING_MIN_LEAD_MINUTES;
  const all = buildCustomerBookingTimeSlots(opts?.scheduling);
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

export function isCustomerOnlineBookingTimeSlot(
  time: string,
  scheduling?: Partial<BookingV2SchedulingConfig>,
): boolean {
  const t = time.trim().slice(0, 5);
  return buildCustomerBookingTimeSlots(scheduling).includes(t);
}
