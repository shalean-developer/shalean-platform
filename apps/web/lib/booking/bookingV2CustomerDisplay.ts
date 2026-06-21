import type { BookingRow } from "@/lib/dashboard/types";
import type { StoredPriceLine } from "@/lib/dashboard/storedPriceBreakdown";
import { customerPriceLinesFromPricingSummary } from "@/lib/booking-v2/adminPricingDisplay";

/** Service labels for booking-v2 slugs (keep in sync with `SERVICE_CONFIG`). */
export const BOOKING_V2_SERVICE_LABELS: Record<string, string> = {
  "regular-cleaning": "Regular Cleaning",
  "deep-cleaning": "Deep Cleaning",
  "moving-cleaning": "Moving Cleaning",
  "office-cleaning": "Office Cleaning",
  "carpet-cleaning": "Carpet Cleaning",
  "airbnb-cleaning": "Airbnb Cleaning",
};

const SERVICE_DETAIL_FIELD_LABELS: Record<string, string> = {
  propertyType: "Property type",
  hasPets: "Pets on site",
  cleaningProducts: "Cleaning products at home",
  equipmentRequired: "Equipment delivery",
  specialInstructions: "Special instructions",
  carpetRooms: "Carpet rooms",
  squareMeters: "Square meters",
  furnished: "Furnished",
  ovenType: "Oven type",
  laundryIncluded: "Laundry included",
  keyCollection: "Key collection",
  turnoverTime: "Turnover time",
};

const ROOM_DETAIL_KEYS = new Set(["bedrooms", "bathrooms", "extraRooms", "rooms"]);

export type CustomerBookingDetailLine = { label: string; value: string };

export function parseBookingCount(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) {
    const n = Math.round(v);
    return n >= 0 && n <= 50 ? n : null;
  }
  if (typeof v === "string" && v.trim()) {
    const n = Number.parseInt(v.trim(), 10);
    return Number.isFinite(n) && n >= 0 && n <= 50 ? n : null;
  }
  return null;
}

export function humanizeBookingToken(raw: string): string {
  return raw
    .trim()
    .replace(/_/g, "-")
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function bookingServiceSlugFromRow(row: Pick<BookingRow, "service" | "service_slug">): string | null {
  const slug = row.service_slug?.trim();
  if (slug) return slug;
  const direct = row.service?.trim();
  if (!direct) return null;
  if (BOOKING_V2_SERVICE_LABELS[direct]) return direct;
  if (direct.includes("-") && !/\s/.test(direct)) return direct;
  return null;
}

export function serviceLabelFromBookingRow(row: Pick<BookingRow, "service" | "service_slug">): string | null {
  const slug = bookingServiceSlugFromRow(row);
  if (slug) return BOOKING_V2_SERVICE_LABELS[slug] ?? humanizeBookingToken(slug);
  const direct = row.service?.trim();
  return direct || null;
}

export function roomsLinesFromServiceDetails(details: unknown): string[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const d = details as Record<string, unknown>;
  const parts: string[] = [];
  const bedrooms = parseBookingCount(d.bedrooms);
  const bathrooms = parseBookingCount(d.bathrooms);
  const extraRooms = parseBookingCount(d.extraRooms);
  if (bedrooms != null && bedrooms > 0) parts.push(`${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`);
  if (bathrooms != null && bathrooms > 0) parts.push(`${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`);
  if (extraRooms != null && extraRooms > 0) parts.push(`${extraRooms} extra room${extraRooms === 1 ? "" : "s"}`);
  return parts;
}

function formatServiceDetailValue(key: string, value: unknown): string | null {
  if (value === "" || value == null) return null;
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value !== "string") return String(value);

  const s = value.trim();
  if (!s) return null;

  if (key === "propertyType") {
    if (s === "apartment") return "Apartment / flat";
    if (s === "townhouse") return "Townhouse";
    if (s === "house") return "House";
    if (s === "office") return "Office";
    if (s === "studio") return "Studio";
  }
  if (key === "hasPets" || key === "cleaningProducts" || key === "furnished" || key === "laundryIncluded") {
    if (s === "yes") return "Yes";
    if (s === "no") return "No";
  }

  return s;
}

export function cleanDetailLinesFromServiceDetails(details: unknown): CustomerBookingDetailLine[] {
  if (!details || typeof details !== "object" || Array.isArray(details)) return [];
  const d = details as Record<string, unknown>;
  const out: CustomerBookingDetailLine[] = [];

  for (const [key, raw] of Object.entries(d)) {
    if (ROOM_DETAIL_KEYS.has(key)) continue;
    const value = formatServiceDetailValue(key, raw);
    if (!value) continue;
    out.push({
      label: SERVICE_DETAIL_FIELD_LABELS[key] ?? humanizeBookingToken(key),
      value,
    });
  }

  return out;
}

function pricingSummaryLineItems(raw: unknown): Array<{ label: string; amountZar: number }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const items = (raw as { lineItems?: unknown }).lineItems;
  if (!Array.isArray(items)) return [];
  const out: Array<{ label: string; amountZar: number }> = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const label = typeof (item as { label?: unknown }).label === "string" ? (item as { label: string }).label.trim() : "";
    const amountRaw = (item as { amountZar?: unknown }).amountZar;
    const amountZar = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
    if (!label || !Number.isFinite(amountZar)) continue;
    out.push({ label, amountZar: Math.round(amountZar) });
  }
  return out;
}

function isRoomPricingLine(label: string): boolean {
  return /^\d+\s+(bedroom|bathroom)s?$/i.test(label.trim());
}

function isBaseServicePricingLine(label: string): boolean {
  return /\(base\)/i.test(label);
}

function isNonExtraPricingLine(label: string): boolean {
  const l = label.trim().toLowerCase();
  if (isRoomPricingLine(label) || isBaseServicePricingLine(label)) return true;
  if (l.includes("service fee")) return true;
  if (l.includes("supplies")) return true;
  if (l.includes("recurring discount")) return true;
  if (l.includes("extra cleaner")) return true;
  if (l.includes("property type")) return true;
  if (l.includes("office size")) return true;
  if (l.includes("property condition")) return true;
  if (l.includes("carpeted room")) return true;
  return false;
}

export function extrasLinesFromBookingRow(row: Pick<BookingRow, "selected_extras" | "pricing_summary" | "extras">): string[] {
  const fromLegacy = Array.isArray(row.extras) ? row.extras : [];
  if (fromLegacy.length > 0) return [];

  const lineItems = pricingSummaryLineItems(row.pricing_summary);
  const extraLines = lineItems.filter((item) => !isNonExtraPricingLine(item.label));
  if (extraLines.length > 0) {
    return extraLines.map(
      (item) => `${item.label} · R ${item.amountZar.toLocaleString("en-ZA")}`,
    );
  }

  const selected = Array.isArray(row.selected_extras) ? row.selected_extras : [];
  if (selected.length === 0) return [];

  const byId = new Map<string, string>();
  for (const item of lineItems) {
    const normalized = item.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    byId.set(normalized, `${item.label} · R ${item.amountZar.toLocaleString("en-ZA")}`);
  }

  return selected.map((id) => {
    const key = String(id).trim();
    if (!key) return null;
    const fromSummary = byId.get(key) ?? byId.get(key.replace(/-/g, "_"));
    if (fromSummary) return fromSummary;
    return humanizeBookingToken(key.replace(/_/g, "-"));
  }).filter((line): line is string => Boolean(line));
}

export function priceLinesFromPricingSummary(summary: unknown): StoredPriceLine[] | null {
  const fromStructured = customerPriceLinesFromPricingSummary(summary);
  if (fromStructured?.length) return fromStructured;

  const lineItems = pricingSummaryLineItems(summary);
  if (lineItems.length === 0) return null;
  return lineItems.map((item) => ({
    kind: "job_combined" as const,
    label: item.label,
    amountZar: item.amountZar,
  }));
}

export function accessNotesFromBookingRow(
  row: Pick<BookingRow, "access_instructions" | "gate_code" | "parking_instructions">,
): CustomerBookingDetailLine[] {
  const out: CustomerBookingDetailLine[] = [];
  const access = row.access_instructions?.trim();
  const gate = row.gate_code?.trim();
  const parking = row.parking_instructions?.trim();
  if (access) out.push({ label: "Access instructions", value: access });
  if (gate) out.push({ label: "Gate code", value: gate });
  if (parking) out.push({ label: "Parking", value: parking });
  return out;
}

export function roomsBathroomsCountsFromServiceDetails(
  details: unknown,
): { rooms: number | null; bathrooms: number | null } {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { rooms: null, bathrooms: null };
  }
  const d = details as Record<string, unknown>;
  const rooms = parseBookingCount(d.bedrooms);
  const bathrooms = parseBookingCount(d.bathrooms);
  return { rooms, bathrooms };
}

export function hasPersistedSchedule(row: Pick<BookingRow, "date" | "time">): boolean {
  return Boolean(row.date && /^\d{4}-\d{2}-\d{2}$/.test(row.date) && row.time?.trim());
}
