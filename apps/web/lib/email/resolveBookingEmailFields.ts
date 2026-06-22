import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

export type BookingEmailRowOverlay = {
  date?: string | null;
  time?: string | null;
  location?: string | null;
  suburb?: string | null;
  service?: string | null;
};

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

  const rowService = bookingRow?.service?.trim();
  if (rowService) return rowService;

  return "Cleaning service";
}

function resolveLocation(snapshot: BookingSnapshotV1 | null, bookingRow?: BookingEmailRowOverlay | null): string {
  const locked = snapshot?.locked?.location?.trim();
  if (locked) return locked;

  const flat = snapshot?.flat?.location?.trim();
  if (flat) return flat;

  const rowLoc = bookingRow?.location?.trim();
  const suburb = bookingRow?.suburb?.trim();
  if (rowLoc && suburb && !rowLoc.toLowerCase().includes(suburb.toLowerCase())) {
    return `${rowLoc}, ${suburb}`;
  }
  return rowLoc || suburb || "";
}

export function resolveBookingEmailFields(input: {
  snapshot: BookingSnapshotV1 | null;
  bookingRow?: BookingEmailRowOverlay | null;
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

  const dateIso = snapshot?.locked?.date ?? snapshot?.flat?.date ?? bookingRow?.date ?? null;
  const formattedDate = typeof dateIso === "string" && dateIso.trim() ? formatZaDateLabel(dateIso) : null;
  const dateLabel = formattedDate ?? (typeof dateIso === "string" ? dateIso.trim() : "");

  const timeLabel = normalizeTimeLabel(
    snapshot?.locked?.time ?? snapshot?.flat?.time ?? bookingRow?.time ?? null,
  );

  return {
    serviceLabel: resolveServiceLabel(snapshot, bookingRow),
    dateLabel,
    timeLabel,
    location: resolveLocation(snapshot, bookingRow),
    cleanerName:
      input.cleanerName?.trim() ||
      snapshot?.cleaner_name?.trim() ||
      null,
  };
}
