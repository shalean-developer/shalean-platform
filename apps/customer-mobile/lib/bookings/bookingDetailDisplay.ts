import type { CustomerBookingRow } from "@/services/types/customerBookings";

function parseCount(v: unknown): number | null {
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

function pricingLineItems(
  summary: unknown,
): Array<{ label: string; amountZar: number }> {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return [];
  const items = (summary as { lineItems?: unknown }).lineItems;
  if (!Array.isArray(items)) return [];
  const out: Array<{ label: string; amountZar: number }> = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const label =
      typeof (item as { label?: unknown }).label === "string"
        ? (item as { label: string }).label.trim()
        : "";
    const amountRaw = (item as { amountZar?: unknown }).amountZar;
    const amountZar = typeof amountRaw === "number" ? amountRaw : Number(amountRaw);
    if (!label || !Number.isFinite(amountZar)) continue;
    out.push({ label, amountZar: Math.round(amountZar) });
  }
  return out;
}

function isNonExtraPricingLine(label: string): boolean {
  const l = label.trim().toLowerCase();
  if (/^\d+\s+(bedroom|bathroom)s?$/i.test(label.trim())) return true;
  if (/\(base\)/i.test(label)) return true;
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

/** Bedroom / bathroom / extra-room lines for booking detail. */
export function roomsLabelFromBooking(row: CustomerBookingRow): string {
  const details = row.service_details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const d = details as Record<string, unknown>;
    const parts: string[] = [];
    const bedrooms = parseCount(d.bedrooms) ?? parseCount(d.rooms);
    const bathrooms = parseCount(d.bathrooms);
    const extraRooms = parseCount(d.extraRooms);
    if (bedrooms != null && bedrooms > 0) {
      parts.push(`${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`);
    }
    if (bathrooms != null && bathrooms > 0) {
      parts.push(`${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`);
    }
    if (extraRooms != null && extraRooms > 0) {
      parts.push(`${extraRooms} extra room${extraRooms === 1 ? "" : "s"}`);
    }
    if (parts.length) return parts.join(" · ");
  }

  const bedrooms = parseCount(row.rooms);
  const bathrooms = parseCount(row.bathrooms);
  const parts: string[] = [];
  if (bedrooms != null && bedrooms > 0) {
    parts.push(`${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`);
  }
  if (bathrooms != null && bathrooms > 0) {
    parts.push(`${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
}

/** Human-readable extras (pricing labels when available, else selected ids). */
export function extrasLabelFromBooking(row: CustomerBookingRow): string {
  const legacy = Array.isArray(row.extras)
    ? row.extras.map((e) => String(e).trim()).filter(Boolean)
    : [];
  if (legacy.length > 0) return legacy.join(", ");

  const lineItems = pricingLineItems(row.pricing_summary);
  const fromPricing = lineItems.filter((item) => !isNonExtraPricingLine(item.label));
  if (fromPricing.length > 0) {
    return fromPricing.map((item) => item.label).join(", ");
  }

  const selected = Array.isArray(row.selected_extras) ? row.selected_extras : [];
  if (selected.length === 0) return "";

  return selected
    .map((id) => humanizeBookingToken(String(id).replace(/_/g, "-")))
    .filter(Boolean)
    .join(", ");
}

/** Customer notes / special instructions for booking detail. */
export function notesLabelFromBooking(row: CustomerBookingRow): string {
  const details = row.service_details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const special = (details as { specialInstructions?: unknown }).specialInstructions;
    if (typeof special === "string" && special.trim()) return special.trim();
  }

  const snap = row.booking_snapshot;
  if (snap && typeof snap === "object" && !Array.isArray(snap)) {
    const notes = (snap as { customer_notes?: unknown }).customer_notes;
    if (typeof notes === "string" && notes.trim()) return notes.trim();
  }

  return "";
}

const SERVICE_LABELS: Record<string, string> = {
  "regular-cleaning": "Regular Cleaning",
  "deep-cleaning": "Deep Cleaning",
  "moving-cleaning": "Moving Cleaning",
  "office-cleaning": "Office Cleaning",
  "carpet-cleaning": "Carpet Cleaning",
  "airbnb-cleaning": "Airbnb Cleaning",
};

export function serviceTitleFromBooking(row: CustomerBookingRow): string {
  const slug = row.service_slug?.trim();
  if (slug && SERVICE_LABELS[slug]) return SERVICE_LABELS[slug];
  const direct = row.service?.trim();
  if (direct && SERVICE_LABELS[direct]) return SERVICE_LABELS[direct];
  if (direct && direct.includes("-") && !/\s/.test(direct)) {
    return SERVICE_LABELS[direct] ?? humanizeBookingToken(direct);
  }
  return direct || "Cleaning";
}
