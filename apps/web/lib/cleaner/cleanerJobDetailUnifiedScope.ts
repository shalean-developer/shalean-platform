import type { CleanerBookingLineItemWire } from "@/lib/cleaner/cleanerBookingRow";
import type { CleanerBookingScopeSource } from "@/lib/cleaner/cleanerBookingScopeSummary";
import { stripExtraTimeSuffixFromDisplayLabel } from "@/lib/cleaner/cleanerExtraDisplayLabel";
import { cleanerBookingCardDetailsFromRow } from "@/lib/cleaner/cleanerBookingScopeSummary";

export type UnifiedJobScope = {
  /** e.g. "3 bedrooms • 2 bathrooms • 1 extra room" */
  propertyLine: string | null;
  /** Deduped extras in display order */
  extras: string[];
};

function parseExtrasFromScopeLine(scopeLines: string[] | undefined): string[] {
  const line = scopeLines?.find((l) => l.startsWith("Extras:"));
  if (!line) return [];
  return line
    .replace(/^Extras:\s*/i, "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function parseRoomsFromScopeLine(scopeLines: string[] | undefined): string | null {
  const line = scopeLines?.find((l) => l.startsWith("Rooms:"));
  if (!line) return null;
  return line.replace(/^Rooms:\s*/i, "").trim() || null;
}

/**
 * Single source for job-detail scope UI: property line + extras, deterministic order.
 * Priority for extras: `booking_line_items` (type extra) → card snapshot/columns → `scope_lines` tail.
 */
export function buildUnifiedJobScope(source: CleanerBookingScopeSource & { scope_lines?: string[] }): UnifiedJobScope {
  const card = cleanerBookingCardDetailsFromRow(source);

  const parts: string[] = [];
  if (card.bedrooms != null && card.bedrooms > 0) {
    parts.push(`${card.bedrooms} bedroom${card.bedrooms === 1 ? "" : "s"}`);
  }
  if (card.bathrooms != null && card.bathrooms > 0) {
    parts.push(`${card.bathrooms} bathroom${card.bathrooms === 1 ? "" : "s"}`);
  }
  if (card.extraRooms != null && card.extraRooms > 0) {
    parts.push(`${card.extraRooms} extra room${card.extraRooms === 1 ? "" : "s"}`);
  }

  let propertyLine = parts.length > 0 ? parts.join(" • ") : null;
  if (!propertyLine) {
    propertyLine = parseRoomsFromScopeLine(source.scope_lines);
  }

  const extrasOrdered: string[] = [];
  const seen = new Set<string>();
  const push = (label: string) => {
    const k = stripExtraTimeSuffixFromDisplayLabel(label);
    if (!k || seen.has(k.toLowerCase())) return;
    seen.add(k.toLowerCase());
    extrasOrdered.push(k);
  };

  const items = Array.isArray(source.lineItems) ? source.lineItems : [];
  for (const it of items) {
    if (String(it.item_type ?? "").toLowerCase() !== "extra") continue;
    push(it.name || String(it.slug ?? ""));
  }
  for (const n of card.extraNames) {
    push(n);
  }
  for (const n of parseExtrasFromScopeLine(source.scope_lines)) {
    push(n);
  }

  return { propertyLine, extras: extrasOrdered };
}

/** Short bullets under “Your earnings” — no per-line cents (not on wire). */
export function buildEarningsIncludesLines(serviceTitle: string, lineItems: readonly CleanerBookingLineItemWire[] | null, extras: readonly string[]): string[] {
  const lines: string[] = [];
  const title = serviceTitle.trim() || "This booking";
  lines.push(`${title} (base — included in your pay)`);

  const items = lineItems ?? [];
  const scopeRoomParts: string[] = [];
  for (const it of items) {
    const t = String(it.item_type ?? "").toLowerCase();
    if (t === "room" || t === "bathroom") {
      const q = it.quantity > 1 ? `${it.quantity}× ` : "";
      scopeRoomParts.push(`${q}${it.name}`.trim());
    }
  }
  if (scopeRoomParts.length > 0) {
    lines.push(`${scopeRoomParts.join(" · ")} (booked scope — included in your pay)`);
  }

  const extraNamesFromItems = new Set(
    items
      .filter((i) => String(i.item_type ?? "").toLowerCase() === "extra")
      .map((i) => stripExtraTimeSuffixFromDisplayLabel(i.name).toLowerCase()),
  );
  for (const it of items) {
    if (String(it.item_type ?? "").toLowerCase() !== "extra") continue;
    lines.push(`${stripExtraTimeSuffixFromDisplayLabel(it.name)} (included in your pay)`);
  }
  for (const name of extras) {
    const cleaned = stripExtraTimeSuffixFromDisplayLabel(name);
    if (extraNamesFromItems.has(cleaned.toLowerCase())) continue;
    lines.push(`${cleaned} (included in your pay)`);
  }

  return lines;
}
