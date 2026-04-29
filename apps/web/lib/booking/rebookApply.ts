"use client";

import { BOOKING_STEP1_KEY, type BookingStep1State } from "@/components/booking/useBookingStep1";
import {
  type BookingServiceId,
  inferServiceGroupFromServiceId,
  inferServiceTypeFromServiceId,
  normalizeStep1ForService,
  parseBookingServiceId,
} from "@/components/booking/serviceCategories";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { clearSelectedCleanerFromStorage } from "@/lib/booking/cleanerSelection";
import { BOOKING_STEP_LS_KEY, type BookingFlowStep } from "@/lib/booking/bookingFlow";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { clearLockedBookingFromStorage, lockedToStep1State } from "@/lib/booking/lockedBooking";

/** Full snapshot JSON for support / analytics (optional). */
export const BOOKING_REBOOK_SNAPSHOT_LS_KEY = "booking_rebook_snapshot";

function step1FromFlat(snapshot: BookingSnapshotV1): BookingStep1State | null {
  const f = snapshot.flat;
  if (!f) return null;
  const service = parseBookingServiceId(f.service);
  if (!service) return null;
  const rooms = typeof f.rooms === "number" && f.rooms >= 1 ? Math.min(10, f.rooms) : 1;
  const bathrooms = typeof f.bathrooms === "number" && f.bathrooms >= 1 ? Math.min(10, f.bathrooms) : 1;
  const extras = Array.isArray(f.extras) ? f.extras.filter((e): e is string => typeof e === "string") : [];
  const location = typeof f.location === "string" ? f.location.trim().slice(0, 500) : "";
  const group = inferServiceGroupFromServiceId(service);
  const typ = inferServiceTypeFromServiceId(service);
  const draft: BookingStep1State = {
    selectedCategory: group,
    service_group: group,
    service_type: typ,
    service,
    serviceAreaLocationId: null,
    serviceAreaCityId: null,
    serviceAreaName: "",
    location,
    propertyType: null,
    cleaningFrequency: "one_time",
    rooms,
    bathrooms,
    extraRooms: 0,
    extras,
  };
  return normalizeStep1ForService(draft);
}

/**
 * Applies a stored booking snapshot for 1-click rebook: restores step-1 fields, clears slot/cleaner,
 * jumps to schedule step (fresh date/time pricing).
 */
export function applyRebookSnapshot(snapshot: BookingSnapshotV1 | null | undefined): boolean {
  if (typeof window === "undefined") return false;
  if (!snapshot) return false;

  let step1: BookingStep1State | null = null;
  const locked = snapshot.locked;
  if (locked && locked.service && typeof locked.rooms === "number") {
    step1 = lockedToStep1State(locked as LockedBooking);
  }
  if (!step1) {
    step1 = step1FromFlat(snapshot);
  }
  if (!step1 || !step1.service) return false;

  try {
    localStorage.setItem(BOOKING_STEP1_KEY, JSON.stringify(step1));
    localStorage.setItem(BOOKING_REBOOK_SNAPSHOT_LS_KEY, JSON.stringify(snapshot));
    localStorage.setItem(BOOKING_STEP_LS_KEY, "when" satisfies BookingFlowStep);
    clearLockedBookingFromStorage();
    clearSelectedCleanerFromStorage();
    window.dispatchEvent(new Event("booking-storage-sync"));
  } catch {
    return false;
  }
  return true;
}
