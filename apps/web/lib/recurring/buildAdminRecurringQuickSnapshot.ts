import "server-only";

import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { parseLockedBookingFromUnknown } from "@/lib/booking/lockedBooking";

function serviceMeta(service: BookingServiceId): {
  service: BookingServiceId;
  service_group: "regular" | "specialised";
  selectedCategory: "regular" | "specialised";
  service_type:
    | "standard_cleaning"
    | "deep_cleaning"
    | "move_cleaning"
    | "airbnb_cleaning"
    | "carpet_cleaning";
} {
  if (service === "deep") {
    return {
      service: "deep",
      service_group: "specialised",
      selectedCategory: "specialised",
      service_type: "deep_cleaning",
    };
  }
  if (service === "move") {
    return {
      service: "move",
      service_group: "specialised",
      selectedCategory: "specialised",
      service_type: "move_cleaning",
    };
  }
  return {
    service: "standard",
    service_group: "regular",
    selectedCategory: "regular",
    service_type: "standard_cleaning",
  };
}

/** `HH:mm` for lock + pricing job (defaults to `09:00`). */
export function normalizeVisitTimeHm(raw: string | undefined): string {
  const s = String(raw ?? "").trim();
  if (!s) return "09:00";
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return "09:00";
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/**
 * Minimal {@link BookingSnapshotV1} for `recurring_bookings.booking_snapshot_template` when an admin
 * creates a plan from email + address (generator clones `locked` per occurrence date).
 */
export function buildAdminRecurringQuickSnapshot(params: {
  startDateYmd: string;
  visitTimeHm: string;
  address: string;
  priceZar: number;
  service: BookingServiceId;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  userId: string;
}): BookingSnapshotV1 | null {
  const email = normalizeEmail(params.customerEmail);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;

  const meta = serviceMeta(params.service);
  const lockedAt = new Date().toISOString();
  const lockPayload = {
    ...meta,
    locked: true,
    lockedAt,
    date: params.startDateYmd,
    time: params.visitTimeHm,
    finalPrice: Math.max(1, Math.round(params.priceZar)),
    finalHours: 3,
    surge: 1,
    rooms: 2,
    bathrooms: 1,
    extraRooms: 0,
    extras: [] as string[],
    location: params.address.trim().slice(0, 500),
    propertyType: "apartment" as const,
    cleaningFrequency: "one_time" as const,
  };

  const locked = parseLockedBookingFromUnknown(lockPayload);
  if (!locked) return null;

  const phone = params.customerPhone.trim().length >= 5 ? params.customerPhone.trim() : "0000000000";

  return {
    v: 1,
    locked,
    customer: {
      name: params.customerName.trim(),
      email,
      phone,
      user_id: params.userId,
      type: "login",
    },
    tip_zar: 0,
    discount_zar: 0,
    promo_code: null,
    total_zar: Math.max(1, Math.round(params.priceZar)),
  };
}
