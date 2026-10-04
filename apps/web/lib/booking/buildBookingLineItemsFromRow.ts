import "server-only";

import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";
import { zarToCents } from "@/lib/booking/buildBookingLineItems";
import { sanitizeBookingExtrasForPersist } from "@/lib/booking/sanitizeBookingExtrasForPersist";

const BACKFILL_SOURCE = "backfill_v1" as const;
const AUTHORITATIVE_SUBTOTAL_BACKFILL_SOURCE = "backfill_v2_authoritative_subtotal" as const;

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function positiveIntOrNull(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.min(20, Math.floor(v));
  if (typeof v === "string" && /^\d+$/.test(v.trim())) {
    const n = parseInt(v.trim(), 10);
    if (n > 0) return Math.min(20, n);
  }
  return null;
}

function snapshotFlat(snapshot: unknown): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  const f = snapshot.flat;
  return isRecord(f) ? f : null;
}

function snapshotLocked(snapshot: unknown): Record<string, unknown> | null {
  if (!isRecord(snapshot)) return null;
  const L = snapshot.locked;
  return isRecord(L) ? L : null;
}

export type BookingRowLineItemBackfillInput = {
  id: string;
  service?: string | null;
  rooms?: unknown;
  bathrooms?: unknown;
  extras?: unknown;
  total_paid_zar?: number | null;
  amount_paid_cents?: number | null;
  /** Authoritative visit subtotal before the company-only service fee. */
  base_amount_cents?: number | null;
  /** Company-only service fee; persisted as a non-cleaner-earning reconciliation line. */
  service_fee_cents?: number | null;
  booking_snapshot?: unknown | null;
};

/**
 * Best-effort line items for **historical** bookings (no live catalog).
 * Uses `total_paid_zar` / `amount_paid_cents` when present to reconcile a `base` line vs persisted extras;
 * room/bathroom lines are **scope-only** (zero cents) when counts are known.
 */
export function buildBookingLineItemsFromRow(b: BookingRowLineItemBackfillInput): BookingLineItemInsert[] {
  const snap = b.booking_snapshot;
  const flat = snapshotFlat(snap);
  const locked = snapshotLocked(snap);

  const rooms =
    positiveIntOrNull(b.rooms) ?? positiveIntOrNull(flat?.rooms) ?? positiveIntOrNull(locked?.rooms);
  const bathrooms =
    positiveIntOrNull(b.bathrooms) ??
    positiveIntOrNull(flat?.bathrooms) ??
    positiveIntOrNull(locked?.bathrooms);

  const extrasRaw = Array.isArray(b.extras)
    ? (b.extras as unknown[])
    : Array.isArray(locked?.extras_line_items)
      ? (locked.extras_line_items as unknown[])
      : [];

  const extrasPersist = sanitizeBookingExtrasForPersist(extrasRaw, {
    where: "buildBookingLineItemsFromRow",
    bookingId: b.id,
  });

  let totalZar: number | null = null;
  if (typeof b.total_paid_zar === "number" && Number.isFinite(b.total_paid_zar)) {
    totalZar = Math.round(b.total_paid_zar);
  } else if (typeof b.amount_paid_cents === "number" && Number.isFinite(b.amount_paid_cents)) {
    totalZar = Math.round(b.amount_paid_cents / 100);
  }

  const extraSumZar = extrasPersist.reduce((s, e) => s + (Number.isFinite(e.price) ? e.price : 0), 0);
  const serviceLabel = typeof b.service === "string" && b.service.trim() ? b.service.trim() : "Booking";

  const items: BookingLineItemInsert[] = [];

  const authoritativeBaseCents =
    typeof b.base_amount_cents === "number" && Number.isFinite(b.base_amount_cents) && b.base_amount_cents > 0
      ? Math.max(0, Math.round(b.base_amount_cents))
      : null;
  const authoritativeServiceFeeCents =
    typeof b.service_fee_cents === "number" && Number.isFinite(b.service_fee_cents) && b.service_fee_cents > 0
      ? Math.max(0, Math.round(b.service_fee_cents))
      : 0;

  /*
   * Modern Booking V2 rows persist an authoritative visit subtotal in
   * base_amount_cents. This is a service-value field, not collected cash, so it
   * remains valid for fully credit/promo-covered R0 settlements where
   * total_paid_zar / amount_paid_cents are correctly zero.
   *
   * Use one cleaner-earning base line for that full visit subtotal and keep the
   * company-only service fee as an adjustment line. Do not also expand legacy
   * extras here: base_amount_cents already includes the complete visit subtotal,
   * so doing both would double-count earnings.
   */
  if (authoritativeBaseCents != null) {
    items.push({
      item_type: "base",
      slug: null,
      name: `${serviceLabel} (authoritative subtotal backfill)`,
      quantity: 1,
      unit_price_cents: authoritativeBaseCents,
      total_price_cents: authoritativeBaseCents,
      pricing_source: AUTHORITATIVE_SUBTOTAL_BACKFILL_SOURCE,
      metadata: {
        booking_id: b.id,
        source_column: "base_amount_cents",
        cash_total_zar: totalZar,
      },
    });

    if (authoritativeServiceFeeCents > 0) {
      items.push({
        item_type: "adjustment",
        slug: "service-fee",
        name: "Service fee (backfill)",
        quantity: 1,
        unit_price_cents: authoritativeServiceFeeCents,
        total_price_cents: authoritativeServiceFeeCents,
        pricing_source: AUTHORITATIVE_SUBTOTAL_BACKFILL_SOURCE,
        metadata: {
          source_column: "service_fee_cents",
          company_only: true,
        },
        earns_cleaner: false,
      });
    }

    if (rooms != null && rooms >= 1) {
      items.push({
        item_type: "room",
        slug: null,
        name: "Bedrooms (scope)",
        quantity: rooms,
        unit_price_cents: 0,
        total_price_cents: 0,
        pricing_source: AUTHORITATIVE_SUBTOTAL_BACKFILL_SOURCE,
        metadata: { scope_only: true },
      });
    }

    if (bathrooms != null && bathrooms >= 1) {
      items.push({
        item_type: "bathroom",
        slug: null,
        name: "Bathrooms (scope)",
        quantity: bathrooms,
        unit_price_cents: 0,
        total_price_cents: 0,
        pricing_source: AUTHORITATIVE_SUBTOTAL_BACKFILL_SOURCE,
        metadata: { scope_only: true },
      });
    }

    return items;
  }

  const baseZar =
    totalZar != null ? Math.max(0, totalZar - Math.round(extraSumZar)) : extraSumZar > 0 ? 0 : 0;

  items.push({
    item_type: "base",
    slug: null,
    name: `${serviceLabel} (backfill)`,
    quantity: 1,
    unit_price_cents: zarToCents(baseZar),
    total_price_cents: zarToCents(baseZar),
    pricing_source: BACKFILL_SOURCE,
    metadata: { booking_id: b.id, total_paid_zar: totalZar },
  });

  if (rooms != null && rooms >= 1) {
    items.push({
      item_type: "room",
      slug: null,
      name: "Bedrooms (scope)",
      quantity: rooms,
      unit_price_cents: 0,
      total_price_cents: 0,
      pricing_source: BACKFILL_SOURCE,
      metadata: { scope_only: true },
    });
  }

  if (bathrooms != null && bathrooms >= 1) {
    items.push({
      item_type: "bathroom",
      slug: null,
      name: "Bathrooms (scope)",
      quantity: bathrooms,
      unit_price_cents: 0,
      total_price_cents: 0,
      pricing_source: BACKFILL_SOURCE,
      metadata: { scope_only: true },
    });
  }

  for (const e of extrasPersist) {
    const p = Math.round(Number.isFinite(e.price) ? e.price : 0);
    items.push({
      item_type: "extra",
      slug: e.slug,
      name: e.name || e.slug,
      quantity: 1,
      unit_price_cents: zarToCents(p),
      total_price_cents: zarToCents(p),
      pricing_source: BACKFILL_SOURCE,
      metadata: {},
    });
  }

  if (totalZar != null) {
    const sumCents = items.reduce((s, r) => s + r.total_price_cents, 0);
    const expectedCents = zarToCents(totalZar);
    if (sumCents !== expectedCents) {
      items.push({
        item_type: "adjustment",
        slug: null,
        name: "Backfill total reconciliation",
        quantity: 1,
        unit_price_cents: expectedCents - sumCents,
        total_price_cents: expectedCents - sumCents,
        pricing_source: BACKFILL_SOURCE,
        metadata: { expectedZar: totalZar },
      });
    }
  }

  const onlyEmptyBase =
    items.length === 1 &&
    items[0]?.item_type === "base" &&
    items[0].total_price_cents === 0 &&
    extrasPersist.length === 0 &&
    rooms == null &&
    bathrooms == null;
  if (onlyEmptyBase) {
    return [];
  }

  return items;
}
