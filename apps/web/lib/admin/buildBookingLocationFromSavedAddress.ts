import type { CustomerAddressRow } from "@/lib/dashboard/types";

/** Current admin booking location string (label + street context). */
export function buildAdminBookingLocationString(a: Pick<CustomerAddressRow, "label" | "line1" | "suburb">): string {
  return `${a.label.trim()}, ${a.line1.trim()}, ${a.suburb.trim()}`;
}

/** Legacy single-line location used by some older bookings (still matched for price memory). */
export function buildBookingLocationFromSavedAddress(a: Pick<CustomerAddressRow, "line1" | "suburb" | "city" | "postal_code">): string {
  const parts = [
    a.line1.trim(),
    [a.suburb.trim(), a.city.trim()].filter(Boolean).join(", "),
    a.postal_code.trim(),
  ].filter(Boolean);
  return parts.join(" · ");
}

export function formatSavedAddressOptionLabel(a: Pick<CustomerAddressRow, "label" | "line1" | "suburb">): string {
  const sub = a.suburb.trim();
  return sub ? `${a.label.trim()} – ${a.line1.trim()} · ${sub}` : `${a.label.trim()} – ${a.line1.trim()}`;
}

/** Distinct location strings for a saved row (new admin format + legacy). */
export function bookingLocationVariantsForSavedAddress(row: CustomerAddressRow): string[] {
  const next = buildAdminBookingLocationString(row);
  const legacy = buildBookingLocationFromSavedAddress(row);
  return next === legacy ? [next] : [next, legacy];
}

export function locationMatchesSavedAddressRow(typed: string, row: CustomerAddressRow): boolean {
  const t = typed.trim();
  if (!t) return false;
  return bookingLocationVariantsForSavedAddress(row).includes(t);
}
