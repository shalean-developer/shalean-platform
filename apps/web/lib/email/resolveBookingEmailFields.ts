import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

export type BookingEmailRowOverlay = {
  date?: string | null;
  time?: string | null;
  location?: string | null;
  suburb?: string | null;
  service?: string | null;
  service_slug?: string | null;
};

/** Coerce Postgres date/time/text columns from Supabase booking rows. */
export function bookingEmailScalarString(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  return s || null;
}

export function bookingEmailRowOverlayFromRecord(row: Record<string, unknown>): BookingEmailRowOverlay {
  return {
    date: bookingEmailScalarString(row.date),
    time: bookingEmailScalarString(row.time),
    location: bookingEmailScalarString(row.location),
    suburb: bookingEmailScalarString(row.suburb),
    service: bookingEmailScalarString(row.service),
    service_slug: bookingEmailScalarString(row.service_slug),
  };
}

type LooseSnapshotFields = {
  date: string | null;
  time: string | null;
  location: string | null;
  serviceSlug: string | null;
};

/** booking-v2 and other non-`locked` snapshot shapes stored on `bookings.booking_snapshot`. */
function looseSnapshotFields(raw: unknown): LooseSnapshotFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { date: null, time: null, location: null, serviceSlug: null };
  }
  const o = raw as Record<string, unknown>;
  const date = bookingEmailScalarString(o.date);
  const time = bookingEmailScalarString(o.time);
  const address = bookingEmailScalarString(o.address);
  const suburb = bookingEmailScalarString(o.suburb);
  const city = bookingEmailScalarString(o.city);
  const directLocation = bookingEmailScalarString(o.location);
  let location = directLocation;
  if (!location && address) {
    location = [address, suburb, city].filter(Boolean).join(", ");
  } else if (location && suburb && !location.toLowerCase().includes(suburb.toLowerCase())) {
    location = `${location}, ${suburb}`;
  }
  const serviceSlug = bookingEmailScalarString(o.serviceSlug);
  return { date, time, location, serviceSlug };
}

export function formatZaDateLabel(isoDate: string): string | null {
  const trimmed = isoDate.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d).toLocaleDateString("en-ZA", {
    weekday: "long",
    day: "numeric",
    month: "short",
  });
}

function normalizeTimeLabel(raw: string | null | undefined): string {
  const t = raw?.trim() ?? "";
  if (!t) return "";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

function resolveServiceLabel(
  snapshot: BookingSnapshotV1 | null,
  bookingRow?: BookingEmailRowOverlay | null,
  loose?: LooseSnapshotFields,
): string {
  const lockedService = snapshot?.locked?.service;
  if (lockedService != null) return getServiceLabel(lockedService);

  const flatService = snapshot?.flat?.service?.trim();
  if (flatService) {
    try {
      return getServiceLabel(flatService as BookingServiceId);
    } catch {
      return flatService;
    }
  }

  const fromRow = serviceLabelFromBookingRow({
    service: bookingRow?.service ?? null,
    service_slug: bookingRow?.service_slug ?? null,
  });
  if (fromRow) return fromRow;

  const looseSlug = loose?.serviceSlug?.trim();
  if (looseSlug) {
    const fromLoose = serviceLabelFromBookingRow({ service: looseSlug, service_slug: looseSlug });
    if (fromLoose) return fromLoose;
    try {
      return getServiceLabel(looseSlug as BookingServiceId);
    } catch {
      return looseSlug;
    }
  }

  return "Cleaning service";
}

function resolveLocation(
  snapshot: BookingSnapshotV1 | null,
  bookingRow?: BookingEmailRowOverlay | null,
  loose?: LooseSnapshotFields,
): string {
  const locked = snapshot?.locked?.location?.trim();
  if (locked) return locked;

  const flat = snapshot?.flat?.location?.trim();
  if (flat) return flat;

  const rowLoc = bookingRow?.location?.trim();
  const suburb = bookingRow?.suburb?.trim();
  if (rowLoc && suburb && !rowLoc.toLowerCase().includes(suburb.toLowerCase())) {
    return `${rowLoc}, ${suburb}`;
  }
  if (rowLoc) return rowLoc;
  if (suburb) return suburb;

  return loose?.location?.trim() ?? "";
}

export function resolveBookingEmailFields(input: {
  snapshot: BookingSnapshotV1 | null;
  bookingRow?: BookingEmailRowOverlay | null;
  /** Persisted `bookings.booking_snapshot` when Paystack metadata snapshot is sparse. */
  persistedSnapshot?: unknown;
  cleanerName?: string | null;
}): {
  serviceLabel: string;
  dateLabel: string;
  timeLabel: string;
  location: string;
  cleanerName: string | null;
} {
  const snapshot = input.snapshot;
  const bookingRow = input.bookingRow;
  const loose = looseSnapshotFields(input.persistedSnapshot);

  const dateIso =
    snapshot?.locked?.date ?? snapshot?.flat?.date ?? bookingRow?.date ?? loose.date ?? null;
  const formattedDate = typeof dateIso === "string" && dateIso.trim() ? formatZaDateLabel(dateIso) : null;
  const dateLabel = formattedDate ?? (typeof dateIso === "string" ? dateIso.trim() : "");

  const timeLabel = normalizeTimeLabel(
    snapshot?.locked?.time ?? snapshot?.flat?.time ?? bookingRow?.time ?? loose.time ?? null,
  );

  return {
    serviceLabel: resolveServiceLabel(snapshot, bookingRow, loose),
    dateLabel,
    timeLabel,
    location: resolveLocation(snapshot, bookingRow, loose),
    cleanerName:
      input.cleanerName?.trim() ||
      snapshot?.cleaner_name?.trim() ||
      null,
  };
}
