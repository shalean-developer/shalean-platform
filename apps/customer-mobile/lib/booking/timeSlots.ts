import { BOOKING_MIN_LEAD_MINUTES, johannesburgNowParts } from "@shalean/utils";
import type { BookingV2SchedulingConfig } from "@/services/types/bookingV2";

const DEFAULT_SCHEDULING: Pick<
  BookingV2SchedulingConfig,
  "leadMinutes" | "slotStartHour" | "slotEndHour" | "slotIntervalMinutes"
> = {
  leadMinutes: BOOKING_MIN_LEAD_MINUTES,
  slotStartHour: 8,
  slotEndHour: 12,
  slotIntervalMinutes: 30,
};

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

function hmToMinutes(hm: string): number | null {
  if (!/^\d{2}:\d{2}$/.test(hm)) return null;
  const [h, m] = hm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

export function formatCustomerBookingSlotLabel(slot: string): string {
  const minutes = hmToMinutes(slot);
  if (minutes == null) return slot;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function filterCustomerOnlineBookingTimeSlots(
  dateYmd: string,
  opts?: {
    now?: Date;
    leadMinutes?: number;
    scheduling?: Partial<BookingV2SchedulingConfig>;
  },
): string[] {
  const now = opts?.now ?? new Date();
  const leadMinutes =
    opts?.leadMinutes ?? opts?.scheduling?.leadMinutes ?? BOOKING_MIN_LEAD_MINUTES;
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

/** Next N calendar days (Johannesburg YMD), starting today. */
export function nextBookingDateChips(
  count = 21,
  now = new Date(),
): { ymd: string; label: string; weekday: string }[] {
  const { ymd: todayYmd } = johannesburgNowParts(now);
  const [y, m, d] = todayYmd.split("-").map(Number);
  const out: { ymd: string; label: string; weekday: string }[] = [];
  for (let i = 0; i < count; i++) {
    const dt = new Date(Date.UTC(y, m - 1, d + i, 12, 0, 0));
    const ymd = dt.toISOString().slice(0, 10);
    const weekday = dt.toLocaleDateString("en-ZA", {
      weekday: "short",
      timeZone: "UTC",
    });
    const label = dt.toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
    out.push({ ymd, label, weekday });
  }
  return out;
}
