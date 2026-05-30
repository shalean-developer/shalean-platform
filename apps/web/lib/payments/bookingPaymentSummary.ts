import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { LockedBooking } from "@/lib/booking/lockedBooking";
import { formatCheckoutAddress } from "@/lib/booking/formatCheckoutAddress";
import type { ExtraLineItem } from "@/lib/pricing/extrasConfig";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function uuidOrNull(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim() : "";
  if (!s || !UUID_RE.test(s)) return null;
  return s.toLowerCase();
}

function serviceSlugFromBookingRow(row: BookingRowPaymentInput): string | null {
  const col =
    typeof row.service_slug === "string" && row.service_slug.trim()
      ? row.service_slug.trim().toLowerCase()
      : null;
  if (col) return col;
  const snap = row.booking_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const o = snap as { service_slug?: unknown; locked?: { service?: unknown } };
    if (typeof o.service_slug === "string" && o.service_slug.trim()) return o.service_slug.trim().toLowerCase();
    if (typeof o.locked?.service === "string" && o.locked.service.trim()) {
      return o.locked.service.trim().toLowerCase();
    }
  }
  if (typeof row.service === "string" && row.service.trim()) return row.service.trim().toLowerCase();
  return null;
}

export type BookingPaymentSummary = {
  id: string;
  email: string | null;
  service: string | null;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  extras: { slug?: string; name?: string }[];
  /** Authoritative booking total in ZAR (before tip). */
  priceZar: number;
  /**
   * Serialized `booking_snapshot` for Paystack inline `metadata.booking_json` (finalize / upsert).
   * Null when the row had no snapshot object.
   */
  bookingSnapshotJson: string | null;
  status: string | null;
  /** For subtitle e.g. `Sat · 5.5 hrs @ 07:00` */
  dateYmd: string | null;
  timeHm: string | null;
  hours: number | null;
  cleanerName: string | null;
  /** Visit subtotal from snapshot when present. */
  visitSubtotalZar: number | null;
  /** Sum of priced add-ons from lock snapshot. */
  extrasTotalZar: number;
  /** Remainder attributed to platform / fees (display). */
  serviceFeeZar: number;
  /** Visit line before extras/fees (display). */
  bookingCoreZar: number;
  customerName: string | null;
  customerPhone: string | null;
  customerUserId: string | null;
  cleanersCount: number;
  /** DB `selected_cleaner_id` or snapshot `cleaner_id` when UUID-shaped. */
  selectedCleanerId: string | null;
  /** DB `assignment_type` when set (e.g. `user_selected`, `pending_assignment`). */
  assignmentType: string | null;
  /** DB `service_slug` or normalized service from snapshot / `service` label. */
  serviceSlug: string | null;
  /** Visit location for review (street + area). */
  locationDisplay: string | null;
};

function extrasFromRow(raw: unknown): { slug?: string; name?: string }[] {
  if (!Array.isArray(raw)) return [];
  const out: { slug?: string; name?: string }[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const slug = typeof o.slug === "string" ? o.slug : undefined;
    const name = typeof o.name === "string" ? o.name : undefined;
    if (slug || name) out.push({ slug, name });
  }
  return out;
}

function lockedFromSnapshot(raw: unknown): LockedBooking | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const snap = raw as BookingSnapshotV1;
  const locked = snap?.locked;
  if (!locked || typeof locked !== "object") return null;
  return locked as LockedBooking;
}

export type BookingRowPaymentInput = {
  id: string;
  customer_email?: string | null;
  service?: string | null;
  service_slug?: string | null;
  rooms?: number | null;
  bathrooms?: number | null;
  extras?: unknown;
  total_price?: number | string | null;
  total_paid_zar?: number | null;
  status?: string | null;
  booking_snapshot?: unknown;
  selected_cleaner_id?: string | null;
  assignment_type?: string | null;
  location?: string | null;
};

export function bookingRowToPaymentSummary(row: BookingRowPaymentInput): BookingPaymentSummary {
  const snapObj = row.booking_snapshot as BookingSnapshotV1 | undefined;
  const locked = lockedFromSnapshot(row.booking_snapshot);
  const roomsRaw = locked?.rooms ?? (typeof row.rooms === "number" ? row.rooms : Number(row.rooms));
  const bedrooms = Number.isFinite(Number(roomsRaw)) ? Math.max(1, Math.round(Number(roomsRaw))) : 1;
  const bathsRaw = locked?.bathrooms ?? (typeof row.bathrooms === "number" ? row.bathrooms : Number(row.bathrooms));
  const bathrooms = Number.isFinite(Number(bathsRaw)) ? Math.max(1, Math.round(Number(bathsRaw))) : 1;
  const extraRoomsRaw = locked?.extraRooms ?? 0;
  const extraRooms = Number.isFinite(Number(extraRoomsRaw)) ? Math.max(0, Math.round(Number(extraRoomsRaw))) : 0;
  const extras =
    locked?.extras?.length && Array.isArray(locked.extras)
      ? locked.extras.map((slug) => ({ slug: String(slug), name: String(slug).replace(/-/g, " ") }))
      : extrasFromRow(row.extras);

  const snap = snapObj;
  const dateYmd =
    typeof locked?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(locked.date)
      ? locked.date
      : typeof snap?.flat?.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(snap.flat.date)
        ? snap.flat.date
        : null;
  const timeHm =
    typeof locked?.time === "string" && locked.time.trim()
      ? locked.time.trim()
      : typeof snap?.flat?.time === "string" && snap.flat.time.trim()
        ? snap.flat.time.trim()
        : null;
  const hoursRaw = locked?.finalHours ?? locked?.duration;
  const hours = hoursRaw != null && Number.isFinite(Number(hoursRaw)) ? Number(hoursRaw) : null;
  const cleanerName =
    typeof snap?.cleaner_name === "string" && snap.cleaner_name.trim() ? snap.cleaner_name.trim() : null;
  const selectedCleanerId = uuidOrNull(row.selected_cleaner_id) ?? uuidOrNull(snap?.cleaner_id);
  const assignmentRaw = typeof row.assignment_type === "string" ? row.assignment_type.trim() : "";
  const assignmentType = assignmentRaw.length > 0 ? assignmentRaw : null;
  const serviceSlug = serviceSlugFromBookingRow(row);
  const customerName =
    typeof snap?.customer?.name === "string" && snap.customer.name.trim() ? snap.customer.name.trim() : null;
  const customerPhone =
    typeof snap?.customer?.phone === "string" && snap.customer.phone.trim() ? snap.customer.phone.trim() : null;
  const customerUserId =
    typeof snap?.customer?.user_id === "string" && /^[0-9a-f-]{36}$/i.test(snap.customer.user_id.trim())
      ? snap.customer.user_id.trim()
      : null;
  const cleanersRaw = locked?.cleanersCount;
  const cleanersCount =
    cleanersRaw != null && Number.isFinite(Number(cleanersRaw)) ? Math.max(1, Math.round(Number(cleanersRaw))) : 1;

  const extrasLines: ExtraLineItem[] = Array.isArray(locked?.extras_line_items) ? locked.extras_line_items : [];
  const extrasTotalZar = extrasLines.reduce((s, x) => s + (Number.isFinite(x.price) ? Math.round(x.price) : 0), 0);

  const visitSubtotalZar =
    typeof snap?.visit_total_zar === "number" && Number.isFinite(snap.visit_total_zar)
      ? Math.round(snap.visit_total_zar)
      : typeof locked?.quoteSubtotalZar === "number" && Number.isFinite(locked.quoteSubtotalZar)
        ? Math.round(locked.quoteSubtotalZar)
        : null;

  const tp = row.total_price != null && row.total_price !== "" ? Number(row.total_price) : NaN;
  const tz = row.total_paid_zar != null ? Number(row.total_paid_zar) : NaN;
  const fromLocked = locked?.finalPrice != null ? Number(locked.finalPrice) : NaN;
  const priceZar = Number.isFinite(tp) && tp > 0
    ? Math.round(tp)
    : Number.isFinite(tz) && tz > 0
      ? Math.round(tz)
      : Number.isFinite(fromLocked) && fromLocked > 0
        ? Math.round(fromLocked)
        : 0;

  let bookingCoreZar = Math.max(0, priceZar - extrasTotalZar);
  let serviceFeeZar = 0;
  if (
    visitSubtotalZar != null &&
    visitSubtotalZar >= 0 &&
    visitSubtotalZar + extrasTotalZar <= priceZar
  ) {
    bookingCoreZar = visitSubtotalZar;
    serviceFeeZar = priceZar - bookingCoreZar - extrasTotalZar;
  }

  const snapRaw = row.booking_snapshot;
  const bookingSnapshotJson =
    snapRaw != null && typeof snapRaw === "object"
      ? JSON.stringify(snapRaw)
      : typeof snapRaw === "string" && snapRaw.trim()
        ? snapRaw.trim()
        : null;

  const rowLocation = typeof row.location === "string" ? row.location.trim() : "";
  const lockedLocation = typeof locked?.location === "string" ? locked.location.trim() : "";
  const lockedAreaName =
    typeof locked?.serviceAreaName === "string" ? locked.serviceAreaName.trim() : "";
  const locationDisplay = formatCheckoutAddress({
    serviceAreaName: lockedAreaName || null,
    streetAddress: null,
    displayLocation: rowLocation || lockedLocation || null,
  });

  return {
    id: row.id,
    email: row.customer_email ?? null,
    service: row.service ?? null,
    bedrooms,
    bathrooms,
    extraRooms,
    extras,
    priceZar,
    bookingSnapshotJson,
    status: row.status ?? null,
    dateYmd,
    timeHm,
    hours,
    cleanerName,
    visitSubtotalZar,
    extrasTotalZar,
    serviceFeeZar,
    bookingCoreZar,
    customerName,
    customerPhone,
    customerUserId,
    cleanersCount,
    selectedCleanerId,
    assignmentType,
    serviceSlug,
    locationDisplay: locationDisplay === "Not set yet" ? null : locationDisplay,
  };
}

const MAX_TIP_ZAR = 50_000;

/** Tip amount allowed at Paystack checkout (ZAR whole rands). */
export function clampTipZar(raw: unknown): number {
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(MAX_TIP_ZAR, Math.round(n));
}

/** Total charge in cents: booking + tip. */
export function bookingPaymentTotalCents(row: BookingRowPaymentInput, tipZar: number): number | null {
  const s = bookingRowToPaymentSummary(row);
  const tip = clampTipZar(tipZar);
  const totalZar = s.priceZar + tip;
  if (totalZar <= 0) return null;
  return Math.round(totalZar * 100);
}

export function formatPaymentBookingCostSubtitle(
  s: Pick<BookingPaymentSummary, "dateYmd" | "timeHm" | "hours">,
): string {
  const day =
    s.dateYmd != null
      ? new Date(`${s.dateYmd}T12:00:00`).toLocaleDateString("en-ZA", { weekday: "short" })
      : "";
  const hrs = s.hours != null && Number.isFinite(s.hours) ? `${s.hours} hrs` : "";
  const tm = s.timeHm?.trim() ?? "";
  const parts: string[] = [];
  if (day) parts.push(day);
  if (hrs) parts.push(hrs);
  if (tm) parts.push(`@ ${tm}`);
  return parts.join(" · ");
}
