import { getServiceLabel, type BookingServiceId } from "@/components/booking/serviceCategories";
import { serviceLabelFromBookingRow } from "@/lib/booking/bookingV2CustomerDisplay";
import { BOOKING_EXTRA_LABELS } from "@/lib/booking/extraLabels";
import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";

export type BookingEmailRowOverlay = {
  date?: string | null;
  time?: string | null;
  location?: string | null;
  suburb?: string | null;
  service?: string | null;
  service_slug?: string | null;
  extras?: unknown;
  selected_extras?: unknown;
  booking_type?: string | null;
  recurring_frequency?: string | null;
  recurring_days?: unknown;
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
    extras: row.extras,
    selected_extras: row.selected_extras,
    booking_type: bookingEmailScalarString(row.booking_type),
    recurring_frequency: bookingEmailScalarString(
      row.recurring_frequency ?? (row as { frequency?: unknown }).frequency,
    ),
    recurring_days: row.recurring_days ?? (row as { days_of_week?: unknown }).days_of_week,
  };
}

type LooseSnapshotFields = {
  date: string | null;
  time: string | null;
  location: string | null;
  suburb: string | null;
  serviceSlug: string | null;
  extras: string[];
  recurringFrequency: string | null;
  recurringDays: string[];
};

function humanizeExtraSlug(slug: string): string {
  const key = slug.trim().toLowerCase().replace(/_/g, "-");
  if (BOOKING_EXTRA_LABELS[key]) return BOOKING_EXTRA_LABELS[key];
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function formatExtraDisplayLine(x: unknown): string | null {
  if (typeof x === "string") {
    const s = x.trim();
    return s ? humanizeExtraSlug(s) : null;
  }
  if (x && typeof x === "object") {
    const o = x as { name?: string; label?: string; slug?: string; id?: string; price?: unknown; priceZar?: unknown };
    const name =
      (typeof o.name === "string" && o.name.trim()) ||
      (typeof o.label === "string" && o.label.trim()) ||
      "";
    const slug =
      (typeof o.slug === "string" && o.slug.trim()) ||
      (typeof o.id === "string" && o.id.trim()) ||
      "";
    const displayName = name || (slug ? humanizeExtraSlug(slug) : "");
    if (!displayName) return null;
    const priceRaw = o.price ?? o.priceZar;
    const p = typeof priceRaw === "number" ? priceRaw : Number(priceRaw);
    if (Number.isFinite(p) && p > 0) {
      return `${displayName} · R ${Math.round(p).toLocaleString("en-ZA")}`;
    }
    return displayName;
  }
  return null;
}

function extrasLinesFromPayload(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const x of raw) {
    const line = formatExtraDisplayLine(x);
    if (line) out.push(line);
  }
  return out;
}

function titleCaseWeekday(raw: string): string {
  const s = raw.trim();
  if (!s) return "";
  const lower = s.toLowerCase();
  const full: Record<string, string> = {
    sun: "Sunday",
    sunday: "Sunday",
    mon: "Monday",
    monday: "Monday",
    tue: "Tuesday",
    tues: "Tuesday",
    tuesday: "Tuesday",
    wed: "Wednesday",
    wednesday: "Wednesday",
    thu: "Thursday",
    thur: "Thursday",
    thurs: "Thursday",
    thursday: "Thursday",
    fri: "Friday",
    friday: "Friday",
    sat: "Saturday",
    saturday: "Saturday",
  };
  if (full[lower]) return full[lower]!;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function weekdayLabelsFromDays(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const out: string[] = [];
  for (const d of raw) {
    if (typeof d === "string" && d.trim()) {
      const label = titleCaseWeekday(d);
      if (label) out.push(label);
      continue;
    }
    const n = typeof d === "number" ? d : Number(d);
    if (Number.isFinite(n) && n >= 0 && n <= 6) out.push(names[n]!);
  }
  return out;
}

function frequencyLabel(raw: string | null | undefined): string | null {
  const f = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!f) return null;
  if (f === "weekly") return "Weekly";
  if (f === "biweekly" || f === "fortnightly") return "Fortnightly";
  if (f === "monthly") return "Monthly";
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/** booking-v2 and other non-`locked` snapshot shapes stored on `bookings.booking_snapshot`. */
function looseSnapshotFields(raw: unknown): LooseSnapshotFields {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      date: null,
      time: null,
      location: null,
      suburb: null,
      serviceSlug: null,
      extras: [],
      recurringFrequency: null,
      recurringDays: [],
    };
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
  const extras = extrasLinesFromPayload(o.selectedExtras ?? o.extras);
  const sub =
    o.subscription && typeof o.subscription === "object" && !Array.isArray(o.subscription)
      ? (o.subscription as Record<string, unknown>)
      : null;
  const recurringFrequency =
    bookingEmailScalarString(o.recurringFrequency) ??
    bookingEmailScalarString(sub?.frequency) ??
    null;
  const recurringDays = weekdayLabelsFromDays(o.recurringDays ?? o.days_of_week ?? sub?.days);
  return { date, time, location, suburb, serviceSlug, extras, recurringFrequency, recurringDays };
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

function resolveSuburb(
  snapshot: BookingSnapshotV1 | null,
  bookingRow?: BookingEmailRowOverlay | null,
  loose?: LooseSnapshotFields,
): string | null {
  const fromRow = bookingRow?.suburb?.trim();
  if (fromRow) return fromRow;
  const fromLoose = loose?.suburb?.trim();
  if (fromLoose) return fromLoose;
  void snapshot;
  return null;
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

function resolveExtrasLabel(
  snapshot: BookingSnapshotV1 | null,
  bookingRow?: BookingEmailRowOverlay | null,
  loose?: LooseSnapshotFields,
): string | null {
  const fromLineItems = extrasLinesFromPayload(snapshot?.locked?.extras_line_items);
  if (fromLineItems.length) return fromLineItems.join(", ");

  const fromLocked = extrasLinesFromPayload(snapshot?.locked?.extras);
  if (fromLocked.length) return fromLocked.join(", ");

  const fromFlat = extrasLinesFromPayload(snapshot?.flat?.extras);
  if (fromFlat.length) return fromFlat.join(", ");

  const fromRowExtras = extrasLinesFromPayload(bookingRow?.extras);
  if (fromRowExtras.length) return fromRowExtras.join(", ");

  const fromSelected = extrasLinesFromPayload(bookingRow?.selected_extras);
  if (fromSelected.length) return fromSelected.join(", ");

  if (loose?.extras?.length) return loose.extras.join(", ");
  return null;
}

function resolveRecurringSummary(
  snapshot: BookingSnapshotV1 | null,
  bookingRow?: BookingEmailRowOverlay | null,
  loose?: LooseSnapshotFields,
): string | null {
  const freq =
    frequencyLabel(snapshot?.subscription?.frequency) ??
    frequencyLabel(bookingRow?.recurring_frequency) ??
    frequencyLabel(loose?.recurringFrequency);
  if (!freq) {
    const bookingType = String(bookingRow?.booking_type ?? "").trim().toLowerCase();
    if (bookingType !== "recurring") return null;
  }
  const days = [
    ...weekdayLabelsFromDays(bookingRow?.recurring_days),
    ...(loose?.recurringDays ?? []),
  ];
  const uniqueDays = [...new Set(days)];
  if (!freq && uniqueDays.length === 0) return null;
  if (freq && uniqueDays.length) return `${freq} · ${uniqueDays.join(" • ")}`;
  if (uniqueDays.length) return uniqueDays.join(" • ");
  return freq ?? "Recurring plan";
}

function resolveCleanerStatusLabel(cleanerName: string | null): string {
  const name = cleanerName?.trim();
  if (name) return name;
  return "Cleaner assignment pending";
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
  suburb: string | null;
  extrasLabel: string | null;
  recurringSummary: string | null;
  cleanerName: string | null;
  cleanerStatusLabel: string;
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

  const cleanerName =
    input.cleanerName?.trim() || snapshot?.cleaner_name?.trim() || null;

  return {
    serviceLabel: resolveServiceLabel(snapshot, bookingRow, loose),
    dateLabel,
    timeLabel,
    location: resolveLocation(snapshot, bookingRow, loose),
    suburb: resolveSuburb(snapshot, bookingRow, loose),
    extrasLabel: resolveExtrasLabel(snapshot, bookingRow, loose),
    recurringSummary: resolveRecurringSummary(snapshot, bookingRow, loose),
    cleanerName,
    cleanerStatusLabel: resolveCleanerStatusLabel(cleanerName),
  };
}
