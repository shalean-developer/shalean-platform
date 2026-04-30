import "server-only";

import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";

export type PriceSnapshotV1 = {
  v: 1;
  service_type: string;
  base_price: number;
  extras: { id: string; name: string; price: number }[];
  total_price: number;
};

function finiteNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Declared visit total in ZAR minor units (cents), from row insert payload. */
export function extractDeclaredTotalCentsFromRowBase(rowBase: Record<string, unknown>): number | null {
  const fromPaid = finiteNumber(rowBase.total_paid_zar);
  if (fromPaid != null) return Math.round(fromPaid * 100);
  const fromTotal = finiteNumber(rowBase.total_price);
  if (fromTotal != null) return Math.round(fromTotal * 100);
  return null;
}

export function sumLineItemsCents(items: readonly BookingLineItemInsert[]): number {
  return items.reduce((s, r) => s + (Number.isFinite(r.total_price_cents) ? r.total_price_cents : 0), 0);
}

/** Snapshot from persisted line items + service slug (ZAR integers for base/total). */
export function buildPriceSnapshotV1FromLineItems(params: {
  serviceTypeSlug: string;
  lineItems: readonly BookingLineItemInsert[];
  totalPriceZar: number;
}): PriceSnapshotV1 {
  const baseCents = params.lineItems
    .filter(
      (r) =>
        r.item_type === "base" ||
        r.item_type === "room" ||
        r.item_type === "bathroom" ||
        r.item_type === "adjustment",
    )
    .reduce((s, r) => s + r.total_price_cents, 0);
  const extras = params.lineItems
    .filter((r) => r.item_type === "extra")
    .map((r) => ({
      id: (r.slug ?? "extra").trim() || "extra",
      name: r.name,
      price: Math.round(r.total_price_cents / 100),
    }));
  return {
    v: 1,
    service_type: params.serviceTypeSlug,
    base_price: Math.round(baseCents / 100),
    extras,
    total_price: Math.round(params.totalPriceZar),
  };
}

export function buildPriceSnapshotV1Checkout(params: {
  service_type: string;
  base_price: number;
  extras: { id: string; name: string; price: number }[];
  total_price: number;
}): PriceSnapshotV1 {
  return {
    v: 1,
    service_type: params.service_type,
    base_price: Math.round(params.base_price),
    extras: params.extras.map((e) => ({
      id: e.id,
      name: e.name,
      price: Math.round(e.price),
    })),
    total_price: Math.round(params.total_price),
  };
}
