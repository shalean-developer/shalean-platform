import type { LockedBooking } from "@/lib/booking/lockedBooking";

export function checkoutDurationMinutesFromLocked(locked: LockedBooking | null): number {
  if (!locked) return 120;
  const hours = locked.duration ?? locked.finalHours;
  if (typeof hours === "number" && Number.isFinite(hours) && hours > 0) {
    return Math.max(30, Math.round(hours * 60));
  }
  return 120;
}
