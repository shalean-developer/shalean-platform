/**
 * Formats service area + street for checkout display, sidebar, and payment review.
 * Deduplicates repeated comma-separated segments (common when area text is pasted into street).
 */
export function dedupeCommaSegments(text: string): string {
  const parts = text
    .split(/,\s*/)
    .map((p) => p.trim())
    .filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const key = p.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out.join(", ");
}

export function formatCheckoutAddress(args: {
  serviceAreaName?: string | null;
  streetAddress?: string | null;
  /** Persisted booking location (often `"Area — street"`). */
  displayLocation?: string | null;
}): string {
  const area = args.serviceAreaName?.trim() ?? "";
  let street = dedupeCommaSegments(args.streetAddress?.trim() ?? "");

  if (area && street) {
    const areaLower = area.toLowerCase();
    const streetLower = street.toLowerCase();
    if (streetLower.includes(areaLower)) {
      return street;
    }
    return `${area} — ${street}`;
  }

  if (street) return street;
  if (area) return area;

  const display = args.displayLocation?.trim() ?? "";
  if (!display) return "Not set yet";

  const sep = display.includes(" — ") ? " — " : null;
  if (sep) {
    const [left, ...rest] = display.split(sep);
    const right = rest.join(sep).trim();
    return formatCheckoutAddress({
      serviceAreaName: left?.trim() ?? "",
      streetAddress: right,
    });
  }

  return dedupeCommaSegments(display);
}
