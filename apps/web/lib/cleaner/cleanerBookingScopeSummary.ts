import type { BookingSnapshotV1 } from "@/lib/booking/paystackChargeTypes";
import type { CleanerBookingLineItemWire } from "@/lib/cleaner/cleanerBookingRow";
import type { ExtraLineItem } from "@/lib/pricing/extrasConfig";

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function positiveIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.floor(v);
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    const n = parseInt(v.trim(), 10);
    if (n > 0) return n;
  }
  return null;
}

function snapshotLocked(snapshot: unknown): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  const L = snapshot.locked;
  return isRecord(L) ? L : null;
}

function snapshotFlat(snapshot: unknown): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  const f = snapshot.flat;
  return isRecord(f) ? f : null;
}

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : ""))
    .filter(Boolean)
    .join(" ");
}

function parseExtrasLineItemsFromLocked(locked: Record<string, unknown>): ExtraLineItem[] {
  const raw = locked.extras_line_items;
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: ExtraLineItem[] = [];
  for (const row of raw) {
    if (!isRecord(row)) continue;
    const slug = typeof row.slug === "string" ? row.slug.trim() : "";
    const name = typeof row.name === "string" ? row.name.trim() : "";
    const price = typeof row.price === "number" && Number.isFinite(row.price) ? row.price : Number.NaN;
    if (!slug || !name || !Number.isFinite(price)) continue;
    out.push({ slug, name, price: Math.round(price) });
  }
  return out;
}

/** Short labels for grouped "Extras:" line (no prices — faster to scan on mobile). */
function extrasShortLabelsFromDbJson(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of raw) {
    if (x && typeof x === "object") {
      const o = x as { name?: string; slug?: string };
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const slug = typeof o.slug === "string" ? o.slug.trim() : "";
      const key = slug || name;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(name || titleCaseFromSlug(slug));
      continue;
    }
    const s = String(x).trim();
    if (s && !seen.has(s)) {
      seen.add(s);
      out.push(titleCaseFromSlug(s));
    }
  }
  return out;
}

function extrasShortLabelsFromLocked(locked: Record<string, unknown>): string[] {
  const fromItems = parseExtrasLineItemsFromLocked(locked);
  if (fromItems.length > 0) {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const i of fromItems) {
      if (!i.slug || seen.has(i.slug)) continue;
      seen.add(i.slug);
      out.push(i.name.trim() ? i.name.trim() : titleCaseFromSlug(i.slug));
    }
    return out;
  }
  const ex = locked.extras;
  if (!Array.isArray(ex) || ex.length === 0) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of ex) {
    const slug = String(raw).trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    out.push(titleCaseFromSlug(slug));
  }
  return out;
}

export type CleanerBookingScopeSource = {
  rooms?: unknown;
  bathrooms?: unknown;
  extras?: unknown;
  booking_snapshot?: unknown | null;
  /** When set (e.g. cleaner APIs), preferred over legacy `extras` / snapshot parsing. */
  lineItems?: readonly CleanerBookingLineItemWire[] | null;
};

/**
 * Builds the same human-readable scope strings as the legacy path, from `booking_line_items`.
 * Ignores `base` / zero-cent `adjustment` rows used for accounting.
 */
export function cleanerBookingScopeLinesFromLineItems(items: readonly CleanerBookingLineItemWire[]): string[] | null {
  if (!Array.isArray(items) || items.length === 0) return null;

  let bedrooms = 0;
  let extraRooms = 0;
  let bathrooms = 0;
  const extraNames: string[] = [];

  for (const it of items) {
    const t = String(it.item_type ?? "").toLowerCase();
    const q = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.max(1, Math.floor(it.quantity)) : 1;
    if (t === "room") {
      if (it.slug === "extra-rooms") extraRooms += q;
      else bedrooms += q;
      continue;
    }
    if (t === "bathroom") {
      bathrooms += q;
      continue;
    }
    if (t === "extra") {
      const label = it.name?.trim() || titleCaseFromSlug(String(it.slug ?? "").trim());
      if (label) extraNames.push(label);
    }
  }

  const lines: string[] = [];
  const roomParts: string[] = [];
  if (bedrooms > 0) roomParts.push(`${bedrooms} bedroom${bedrooms === 1 ? "" : "s"}`);
  if (bathrooms > 0) roomParts.push(`${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`);
  if (extraRooms > 0) roomParts.push(`${extraRooms} extra room${extraRooms === 1 ? "" : "s"}`);
  if (roomParts.length > 0) {
    lines.push(`Rooms: ${roomParts.join(", ")}`);
  }
  if (extraNames.length > 0) {
    lines.push(`Extras: ${extraNames.join(", ")}`);
  }

  return lines.length > 0 ? lines : null;
}

/** Scope lines from `bookings` columns + snapshot only (no `booking_line_items`). */
function buildScopeLinesFromColumnsAndSnapshot(row: CleanerBookingScopeSource): string[] {
  const rec = row as Record<string, unknown>;
  const snap = row.booking_snapshot as BookingSnapshotV1 | null | undefined;
  const flat = snapshotFlat(snap);
  const locked = snapshotLocked(snap);

  const rooms =
    positiveIntOrNull(rec.rooms) ?? positiveIntOrNull(flat?.rooms) ?? positiveIntOrNull(locked?.rooms);
  const bathrooms =
    positiveIntOrNull(rec.bathrooms) ??
    positiveIntOrNull(flat?.bathrooms) ??
    positiveIntOrNull(locked?.bathrooms);

  const lines: string[] = [];
  const roomParts: string[] = [];
  if (rooms != null) roomParts.push(`${rooms} bedroom${rooms === 1 ? "" : "s"}`);
  if (bathrooms != null) roomParts.push(`${bathrooms} bathroom${bathrooms === 1 ? "" : "s"}`);
  if (roomParts.length > 0) {
    lines.push(`Rooms: ${roomParts.join(", ")}`);
  }

  const fromDbLabels = extrasShortLabelsFromDbJson(row.extras);
  if (fromDbLabels.length > 0) {
    lines.push(`Extras: ${fromDbLabels.join(", ")}`);
    return lines;
  }
  if (locked) {
    const extraLabels = extrasShortLabelsFromLocked(locked);
    if (extraLabels.length > 0) {
      lines.push(`Extras: ${extraLabels.join(", ")}`);
    }
  }
  return lines;
}

/**
 * Human-readable scope for cleaner UI — persisted booking columns, snapshot, and
 * `booking_line_items` when they carry room/extra detail. Bundled monthly line items
 * (base + extra rows only) do not replace bedroom/bathroom counts on the booking row.
 */
export function cleanerBookingScopeLines(row: CleanerBookingScopeSource): string[] {
  const baseLines = buildScopeLinesFromColumnsAndSnapshot(row);

  const lineItems = Array.isArray(row.lineItems) && row.lineItems.length > 0 ? row.lineItems : null;
  const liLines = lineItems ? cleanerBookingScopeLinesFromLineItems(lineItems) : null;
  if (!liLines?.length) {
    return baseLines;
  }

  const liRoom = liLines.find((l) => l.startsWith("Rooms:"));
  const baseRoom = baseLines.find((l) => l.startsWith("Rooms:"));
  const liExtras = liLines.find((l) => l.startsWith("Extras:"));
  const baseExtras = baseLines.find((l) => l.startsWith("Extras:"));

  const merged: string[] = [];
  if (liRoom) merged.push(liRoom);
  else if (baseRoom) merged.push(baseRoom);
  if (liExtras) merged.push(liExtras);
  else if (baseExtras) merged.push(baseExtras);

  return merged.length > 0 ? merged : baseLines;
}

function cardDetailsFromLineItems(items: readonly CleanerBookingLineItemWire[]): {
  bedrooms: number | null;
  bathrooms: number | null;
  extraNames: string[];
} {
  let bedrooms = 0;
  let bathrooms = 0;
  const extraNames: string[] = [];

  for (const it of items) {
    const t = String(it.item_type ?? "").toLowerCase();
    const q = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? Math.max(1, Math.floor(it.quantity)) : 1;
    if (t === "room") {
      if (it.slug !== "extra-rooms") bedrooms += q;
      continue;
    }
    if (t === "bathroom") {
      bathrooms += q;
      continue;
    }
    if (t === "extra") {
      const label = it.name?.trim() || titleCaseFromSlug(String(it.slug ?? "").trim());
      if (label) extraNames.push(label);
    }
  }

  return {
    bedrooms: bedrooms > 0 ? bedrooms : null,
    bathrooms: bathrooms > 0 ? bathrooms : null,
    extraNames,
  };
}

/** Bedrooms, bathrooms, and extra labels for compact cleaner job cards (line items preferred). */
export function cleanerBookingCardDetailsFromRow(row: CleanerBookingScopeSource): {
  bedrooms: number | null;
  bathrooms: number | null;
  extraNames: string[];
} {
  const rec = row as Record<string, unknown>;
  const snap = row.booking_snapshot as BookingSnapshotV1 | null | undefined;
  const flat = snapshotFlat(snap);
  const locked = snapshotLocked(snap);

  const bedroomsBase =
    positiveIntOrNull(rec.rooms) ?? positiveIntOrNull(flat?.rooms) ?? positiveIntOrNull(locked?.rooms);
  const bathroomsBase =
    positiveIntOrNull(rec.bathrooms) ??
    positiveIntOrNull(flat?.bathrooms) ??
    positiveIntOrNull(locked?.bathrooms);

  let extraNamesBase: string[] = [];
  const fromDbLabels = extrasShortLabelsFromDbJson(row.extras);
  if (fromDbLabels.length > 0) {
    extraNamesBase = fromDbLabels;
  } else if (locked) {
    extraNamesBase = extrasShortLabelsFromLocked(locked);
  }

  const lineItems = Array.isArray(row.lineItems) && row.lineItems.length > 0 ? row.lineItems : null;
  if (!lineItems) {
    return { bedrooms: bedroomsBase, bathrooms: bathroomsBase, extraNames: extraNamesBase };
  }

  const fromLi = cardDetailsFromLineItems(lineItems);
  return {
    bedrooms: fromLi.bedrooms ?? bedroomsBase,
    bathrooms: fromLi.bathrooms ?? bathroomsBase,
    extraNames: fromLi.extraNames.length > 0 ? fromLi.extraNames : extraNamesBase,
  };
}
