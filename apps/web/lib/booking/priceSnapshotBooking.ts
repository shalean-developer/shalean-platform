import "server-only";

import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";

export type PriceSnapshotV1 = {
  v: 1;
  service_type: string;
  base_price: number;
  extras: { id: string; name: string; price: number }[];
  total_price: number;
  /** Optional audit trail when an admin reprices an existing booking. */
  version?: string;
  repriced_at?: string;
  repriced_by?: string;
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

/** Line persisted on Paystack `metadata.price_snapshot` — verify/upsert must not recompute totals. */
export type CheckoutPriceSnapshotLineV1 = { id: string; name: string; amount_zar: number };

/**
 * Immutable checkout totals at initialize time (`metadata.price_snapshot` + optional DB row fallback).
 * `total_zar` is the Paystack charge (visit + fees − discounts + tip).
 */
export type CheckoutPriceSnapshotV1 = {
  version: 1;
  currency: "ZAR";
  total_zar: number;
  subtotal_zar: number;
  extras_total_zar: number;
  discount_zar: number;
  tip_zar: number;
  visit_total_zar: number;
  duration_hours: number;
  cleaners_count: number;
  line_items: CheckoutPriceSnapshotLineV1[];
  pricing_version_id?: string | null;
};

function finiteZar(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim()) {
    const n = Number(v.trim());
    if (Number.isFinite(n)) return n;
  }
  return null;
}

export function buildCheckoutPriceSnapshotV1FromInit(params: {
  total_zar: number;
  visit_total_zar: number;
  subtotal_zar: number;
  extras_total_zar: number;
  discount_zar: number;
  tip_zar: number;
  duration_hours: number;
  cleaners_count: number;
  pricing_version_id: string | null;
  line_items: readonly CheckoutPriceSnapshotLineV1[];
}): CheckoutPriceSnapshotV1 {
  return {
    version: 1,
    currency: "ZAR",
    total_zar: Math.round(params.total_zar),
    subtotal_zar: Math.round(params.subtotal_zar),
    extras_total_zar: Math.round(params.extras_total_zar),
    discount_zar: Math.round(params.discount_zar),
    tip_zar: Math.round(params.tip_zar),
    visit_total_zar: Math.round(params.visit_total_zar),
    duration_hours: Math.max(0, Number.isFinite(params.duration_hours) ? params.duration_hours : 0),
    cleaners_count: Math.max(1, Math.round(Number.isFinite(params.cleaners_count) ? params.cleaners_count : 1)),
    line_items: params.line_items.map((r) => ({
      id: String(r.id ?? "").trim() || "line",
      name: String(r.name ?? "").trim() || "Line",
      amount_zar: Math.round(Number.isFinite(r.amount_zar) ? r.amount_zar : 0),
    })),
    pricing_version_id: params.pricing_version_id?.trim() || null,
  };
}

function versionIsCheckoutV1(v: unknown): boolean {
  if (v === 1) return true;
  if (typeof v === "string" && v.trim() === "1") return true;
  const n = Number(v);
  return Number.isFinite(n) && Math.round(n) === 1;
}

function currencyIsZar(v: unknown): boolean {
  const s = typeof v === "string" ? v.trim().toUpperCase() : String(v ?? "").trim().toUpperCase();
  return s === "ZAR";
}

function isCheckoutPriceSnapshotV1(o: unknown): o is CheckoutPriceSnapshotV1 {
  if (!o || typeof o !== "object" || Array.isArray(o)) return false;
  const r = o as Record<string, unknown>;
  if (!versionIsCheckoutV1(r.version)) return false;
  if (!currencyIsZar(r.currency)) return false;
  return (
    finiteZar(r.total_zar) != null &&
    finiteZar(r.subtotal_zar) != null &&
    finiteZar(r.visit_total_zar) != null
  );
}

/** Coerce legacy {@link PriceSnapshotV1} JSONB into checkout snapshot shape for upsert. */
export function checkoutPriceSnapshotFromLegacyPriceSnapshotV1(raw: unknown): CheckoutPriceSnapshotV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (versionIsCheckoutV1(o.version) && currencyIsZar(o.currency))
    return isCheckoutPriceSnapshotV1(o) ? (o as CheckoutPriceSnapshotV1) : null;
  if (o.v !== 1) return null;
  const total = finiteZar(o.total_price);
  const base = finiteZar(o.base_price);
  if (total == null) return null;
  const extrasArr = Array.isArray(o.extras) ? o.extras : [];
  const extrasZar = extrasArr.reduce((s, e) => {
    if (!e || typeof e !== "object") return s;
    const p = finiteZar((e as { price?: unknown }).price);
    return s + (p ?? 0);
  }, 0);
  const sub = base ?? Math.max(0, total - extrasZar);
  return {
    version: 1,
    currency: "ZAR",
    total_zar: Math.round(total),
    subtotal_zar: Math.round(sub),
    extras_total_zar: Math.round(extrasZar),
    discount_zar: 0,
    tip_zar: 0,
    visit_total_zar: Math.round(sub + extrasZar),
    duration_hours: 0,
    cleaners_count: 1,
    line_items: [],
    pricing_version_id: null,
  };
}

/**
 * Read `price_snapshot` from Paystack metadata (stringified JSON) or raw webhook object.
 */
export function parseCheckoutPriceSnapshotV1FromMeta(
  meta: Record<string, string | undefined> | null | undefined,
  rawMeta?: Record<string, unknown> | null,
): CheckoutPriceSnapshotV1 | null {
  const tryParse = (val: unknown): CheckoutPriceSnapshotV1 | null => {
    if (val == null) return null;
    /** Paystack metadata values are strings; some paths double-encode JSON. */
    let cur: unknown = val;
    for (let depth = 0; depth < 6 && typeof cur === "string" && cur.trim(); depth += 1) {
      try {
        cur = JSON.parse(cur) as unknown;
      } catch {
        return null;
      }
    }
    if (cur == null) return null;
    if (typeof cur === "string") return null;
    if (typeof cur === "object" && !Array.isArray(cur)) {
      if (isCheckoutPriceSnapshotV1(cur)) return cur as CheckoutPriceSnapshotV1;
      return checkoutPriceSnapshotFromLegacyPriceSnapshotV1(cur);
    }
    return null;
  };

  const fromMetaKey = meta?.price_snapshot;
  const a = tryParse(fromMetaKey);
  if (a) return a;

  if (rawMeta && typeof rawMeta === "object" && "price_snapshot" in rawMeta) {
    const b = tryParse((rawMeta as { price_snapshot?: unknown }).price_snapshot);
    if (b) return b;
  }
  return null;
}
