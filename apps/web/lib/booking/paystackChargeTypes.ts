import type { BookingServiceId } from "@/components/booking/serviceCategories";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";

const META_USER_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** How checkout identity was collected (stored in Paystack metadata / booking snapshot). */
export type BookingCustomerAuthType = "guest" | "login" | "register";

/** Denormalized fields for analytics, rebooking, and debugging (also under `booking_snapshot.flat`). */
export type BookingSnapshotFlatV1 = {
  service: string | null;
  rooms: number | null;
  bathrooms: number | null;
  extras: string[];
  location: string | null;
  date: string | null;
  time: string | null;
};

/** Line-item discounts stored on the Paystack booking snapshot (sum matches `discount_zar`). */
export type BookingSnapshotDiscountLineV1 = {
  id: string;
  label: string;
  amount_zar: number;
};

/** Parsed from `metadata.booking_json` on Paystack charge / verify responses. */
export type BookingSnapshotV1 = {
  v: number;
  locked?: LockedBooking;
  /** Denormalized mirror of `locked` for queries and rebook UX. */
  flat?: BookingSnapshotFlatV1;
  /** Visit total before tip and before discounts (matches checkout `visitTotalZar`). */
  visit_total_zar?: number;
  tip_zar?: number;
  discount_zar?: number;
  /** When set, each row is a portion of `discount_zar` (promo, referral, plan, etc.). */
  discount_lines?: BookingSnapshotDiscountLineV1[];
  promo_code?: string | null;
  total_zar?: number;
  cleaner_id?: string | null;
  cleaner_name?: string | null;
  /** Recurring plan selection; `discount_zar` here is only the plan portion of savings, not promo/referral. */
  subscription?: {
    frequency: "weekly" | "biweekly" | "monthly";
    discount_zar: number;
  } | null;
  /** Customer contact + optional Supabase user id (verified server-side when set). */
  customer?: {
    name: string;
    email: string;
    phone: string;
    user_id: string | null;
    type: BookingCustomerAuthType;
  };
};

/** Redundant snapshot stored under `metadata.booking` at initialize (rebuild without frontend). */
export type PaystackBookingMeta = {
  service?: BookingServiceId | null;
  rooms?: number;
  bathrooms?: number;
  extras?: string[];
  location?: string;
  date?: string;
  time?: string;
};

function parseBookingMetaField(metadata: Record<string, string | undefined>): PaystackBookingMeta | null {
  const raw = metadata.booking;
  if (!raw || !String(raw).trim()) return null;
  try {
    const data = JSON.parse(raw) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) return null;
    return data as PaystackBookingMeta;
  } catch {
    return null;
  }
}

function parseIntMeta(v: string | undefined, fallback: number): number {
  const n = parseInt(String(v ?? ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Builds a minimal snapshot when `booking_json` is missing but flat metadata + `metadata.booking` exist.
 */
function snapshotFromPaystackFallback(
  metadata: Record<string, string | undefined>,
  amountCents: number,
): BookingSnapshotV1 | null {
  const booking = parseBookingMetaField(metadata);
  const finalZar = parseIntMeta(metadata.locked_final_zar, 0);
  const payTotalZar = parseIntMeta(metadata.pay_total_zar, Math.max(0, Math.round(amountCents / 100)));
  const lockedAt = typeof metadata.locked_at === "string" && metadata.locked_at ? metadata.locked_at : new Date().toISOString();

  const date =
    booking?.date && /^\d{4}-\d{2}-\d{2}$/.test(booking.date)
      ? booking.date
      : lockedAt.slice(0, 10);
  const time = typeof booking?.time === "string" && booking.time ? booking.time : "09:00";

  if (!booking && !metadata.customer_email) return null;

  const locked = {
    selectedCategory: null,
    service_group: null,
    service_type: null,
    service: booking?.service ?? null,
    location: typeof booking?.location === "string" ? booking.location : "",
    rooms: typeof booking?.rooms === "number" ? booking.rooms : 1,
    bathrooms: typeof booking?.bathrooms === "number" ? booking.bathrooms : 1,
    extraRooms: 0,
    extras: Array.isArray(booking?.extras) ? booking.extras : [],
    date,
    time,
    finalPrice: finalZar > 0 ? finalZar : payTotalZar,
    finalHours: 1,
    surge: 1,
    locked: true as const,
    lockedAt,
  } as LockedBooking;

  const authType = metadata.customer_type;
  const type: BookingCustomerAuthType =
    authType === "login" || authType === "register" || authType === "guest" ? authType : "guest";

  const custEmailRaw = typeof metadata.customer_email === "string" ? metadata.customer_email : "";
  const custEmail = custEmailRaw ? normalizeEmail(custEmailRaw) : "";
  const custName = typeof metadata.customer_name === "string" ? metadata.customer_name.trim() : "";
  const custPhone = typeof metadata.customer_phone === "string" ? metadata.customer_phone.trim() : "";
  const uidRaw =
    (typeof metadata.userId === "string" && metadata.userId.trim()) ||
    (typeof metadata.customer_user_id === "string" && metadata.customer_user_id.trim()) ||
    "";
  const uid = uidRaw && META_USER_UUID_RE.test(uidRaw) ? uidRaw : null;

  return {
    v: 1,
    total_zar: payTotalZar,
    locked,
    customer: {
      name: custName,
      email: custEmail,
      phone: custPhone,
      user_id: uid,
      type,
    },
  };
}

export function parseBookingSnapshot(
  metadata: Record<string, string | undefined> | null | undefined,
  options?: { amountCents?: number },
): {
  snapshot: BookingSnapshotV1 | null;
  raw: unknown;
} {
  if (!metadata) return { snapshot: null, raw: null };

  let snapshot: BookingSnapshotV1 | null = null;
  let raw: unknown = null;

  const bookingJson = metadata.booking_json;
  if (typeof bookingJson === "string" && bookingJson.trim()) {
    try {
      const data = JSON.parse(bookingJson) as unknown;
      raw = data;
      if (data && typeof data === "object" && !Array.isArray(data)) {
        snapshot = data as BookingSnapshotV1;
      }
    } catch {
      raw = null;
    }
  }

  if (snapshot?.customer?.email) {
    snapshot = {
      ...snapshot,
      customer: {
        ...snapshot.customer,
        email: normalizeEmail(snapshot.customer.email),
      },
    };
  }

  const bookingMeta = parseBookingMetaField(metadata);
  if (snapshot?.locked && bookingMeta) {
    snapshot = {
      ...snapshot,
      locked: {
        ...snapshot.locked,
        ...(bookingMeta.service !== undefined ? { service: bookingMeta.service } : {}),
        ...(typeof bookingMeta.rooms === "number" ? { rooms: bookingMeta.rooms } : {}),
        ...(typeof bookingMeta.bathrooms === "number" ? { bathrooms: bookingMeta.bathrooms } : {}),
        ...(Array.isArray(bookingMeta.extras) ? { extras: bookingMeta.extras } : {}),
        ...(typeof bookingMeta.location === "string" ? { location: bookingMeta.location } : {}),
        ...(typeof bookingMeta.date === "string" ? { date: bookingMeta.date } : {}),
        ...(typeof bookingMeta.time === "string" ? { time: bookingMeta.time } : {}),
      } as LockedBooking,
    };
  }

  if (!snapshot && options?.amountCents !== undefined) {
    snapshot = snapshotFromPaystackFallback(metadata, options.amountCents);
    raw = raw ?? snapshot;
  }

  return { snapshot, raw };
}
