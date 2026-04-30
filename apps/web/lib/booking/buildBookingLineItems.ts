import type { BookingServiceId } from "@/components/booking/serviceCategories";
import { getServiceLabel } from "@/components/booking/serviceCategories";
import type { BookingExtraPersistRow } from "@/lib/booking/sanitizeBookingExtrasForPersist";
import type { BookingLineItemInsert } from "@/lib/booking/bookingLineItemTypes";
import type { JobSubtotalSplitZar } from "@/lib/pricing/pricingEngineSnapshot";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculateCatalogPrice";
import {
  computeBundledExtrasTotalZarSnapshot,
  computeJobSubtotalZarSnapshot,
} from "@/lib/pricing/pricingEngineSnapshot";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { ServiceTariff } from "@/lib/pricing/pricingConfig";
import { normalizePricingJobInput, resolveServiceForPricing, type PricingJobInput } from "@/lib/pricing/pricingEngine";

const PRICING_HOME_WIDGET = "home_widget_catalog_v1" as const;
const PRICING_MONTHLY_BUNDLED = "monthly_bundled_zar_v1" as const;
const PRICING_CHECKOUT_LOCK = "checkout_lock_catalog_v1" as const;

/** Integer ZAR → Paystack-style minor units (cents). */
export function zarToCents(zar: number): number {
  if (!Number.isFinite(zar)) return 0;
  return Math.round(zar * 100);
}

function tariffFor(snapshot: PricingRatesSnapshot, service: BookingServiceId | null): ServiceTariff {
  if (service && snapshot.services[service]) return snapshot.services[service];
  return snapshot.services.standard;
}

function retailExtraZar(snapshot: PricingRatesSnapshot, id: string): number {
  return snapshot.extras[id]?.price ?? 0;
}

function extraName(snapshot: PricingRatesSnapshot, id: string): string {
  return snapshot.extras[id]?.name ?? id;
}

/**
 * Homepage widget: one line per tariff component + per-extra retail lines + optional bundle adjustment.
 * Totals match {@link computeJobSubtotalZarSnapshot} for the same job (integer ZAR); cents sum matches ×100.
 */
export function buildHomeWidgetCatalogLineItems(params: {
  snapshot: PricingRatesSnapshot;
  widgetService: HomeWidgetServiceKey;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  /** Sanitized slugs in effect for the quote (same order as persisted extras). */
  extraSlugs: readonly string[];
}): BookingLineItemInsert[] {
  const job: PricingJobInput = {
    service: params.widgetService as BookingServiceId,
    serviceType: null,
    rooms: params.bedrooms,
    bathrooms: params.bathrooms,
    extraRooms: params.extraRooms,
    extras: [...params.extraSlugs],
  };
  const j = normalizePricingJobInput(job);
  const svc = resolveServiceForPricing(j);
  const cfg = tariffFor(params.snapshot, svc);
  const serviceLabel = svc ? getServiceLabel(svc) : "Service";

  const items: BookingLineItemInsert[] = [];

  items.push({
    item_type: "base",
    slug: svc,
    name: `${serviceLabel} (base)`,
    quantity: 1,
    unit_price_cents: zarToCents(cfg.base),
    total_price_cents: zarToCents(cfg.base),
    pricing_source: PRICING_HOME_WIDGET,
    metadata: { service: svc },
  });

  items.push({
    item_type: "room",
    slug: null,
    name: "Bedrooms",
    quantity: j.rooms,
    unit_price_cents: zarToCents(cfg.bedroom),
    total_price_cents: zarToCents(j.rooms * cfg.bedroom),
    pricing_source: PRICING_HOME_WIDGET,
    metadata: {},
  });

  items.push({
    item_type: "bathroom",
    slug: null,
    name: "Bathrooms",
    quantity: j.bathrooms,
    unit_price_cents: zarToCents(cfg.bathroom),
    total_price_cents: zarToCents(j.bathrooms * cfg.bathroom),
    pricing_source: PRICING_HOME_WIDGET,
    metadata: {},
  });

  if (j.extraRooms > 0) {
    items.push({
      item_type: "room",
      slug: "extra-rooms",
      name: "Extra rooms",
      quantity: j.extraRooms,
      unit_price_cents: zarToCents(cfg.extraRoom),
      total_price_cents: zarToCents(j.extraRooms * cfg.extraRoom),
      pricing_source: PRICING_HOME_WIDGET,
      metadata: {},
    });
  }

  let retailExtrasZar = 0;
  for (const slug of j.extras) {
    const p = retailExtraZar(params.snapshot, slug);
    retailExtrasZar += p;
    items.push({
      item_type: "extra",
      slug,
      name: extraName(params.snapshot, slug),
      quantity: 1,
      unit_price_cents: zarToCents(p),
      total_price_cents: zarToCents(p),
      pricing_source: PRICING_HOME_WIDGET,
      metadata: {},
    });
  }

  const bundledExtrasZar = computeBundledExtrasTotalZarSnapshot(params.snapshot, j.extras, svc);
  const bundleDeltaZar = bundledExtrasZar - retailExtrasZar;
  if (bundleDeltaZar !== 0) {
    items.push({
      item_type: "adjustment",
      slug: null,
      name: "Bundle / combo adjustment (extras)",
      quantity: 1,
      unit_price_cents: zarToCents(bundleDeltaZar),
      total_price_cents: zarToCents(bundleDeltaZar),
      pricing_source: PRICING_HOME_WIDGET,
      metadata: { retailExtrasZar, bundledExtrasZar },
    });
  }

  const subtotalZar = Math.round(computeJobSubtotalZarSnapshot(params.snapshot, j));
  const sumCents = items.reduce((s, r) => s + r.total_price_cents, 0);
  const expectedCents = zarToCents(subtotalZar);
  if (sumCents !== expectedCents) {
    items.push({
      item_type: "adjustment",
      slug: null,
      name: "Subtotal reconciliation (rounding)",
      quantity: 1,
      unit_price_cents: expectedCents - sumCents,
      total_price_cents: expectedCents - sumCents,
      pricing_source: PRICING_HOME_WIDGET,
      metadata: { subtotalZar, sumCentsBefore: sumCents },
    });
  }

  return items;
}

/**
 * Paystack checkout visit: job subtotal split + optional adjustment so line cents equal `visitTotalZar`.
 */
export function buildCheckoutVisitLineItems(params: {
  serviceTypeSlug: string | null;
  job: JobSubtotalSplitZar;
  subtotalZar: number;
  visitTotalZar: number;
}): BookingLineItemInsert[] {
  const slug = params.serviceTypeSlug?.trim() || null;
  const items: BookingLineItemInsert[] = [
    {
      item_type: "base",
      slug,
      name: "Service base",
      quantity: 1,
      unit_price_cents: zarToCents(params.job.serviceBaseZar),
      total_price_cents: zarToCents(params.job.serviceBaseZar),
      pricing_source: PRICING_CHECKOUT_LOCK,
      metadata: {},
    },
    {
      item_type: "room",
      slug: null,
      name: "Rooms, bathrooms & duration",
      quantity: 1,
      unit_price_cents: zarToCents(params.job.roomsZar),
      total_price_cents: zarToCents(params.job.roomsZar),
      pricing_source: PRICING_CHECKOUT_LOCK,
      metadata: {},
    },
    {
      item_type: "extra",
      slug: null,
      name: "Add-ons (subtotal)",
      quantity: 1,
      unit_price_cents: zarToCents(params.job.extrasZar),
      total_price_cents: zarToCents(params.job.extrasZar),
      pricing_source: PRICING_CHECKOUT_LOCK,
      metadata: {},
    },
  ];

  const visit = Math.round(params.visitTotalZar);
  const sumCents = items.reduce((s, r) => s + r.total_price_cents, 0);
  const expectedCents = zarToCents(visit);
  const delta = expectedCents - sumCents;
  if (delta !== 0) {
    items.push({
      item_type: "adjustment",
      slug: null,
      name: "Surge, slot demand & fees",
      quantity: 1,
      unit_price_cents: delta,
      total_price_cents: delta,
      pricing_source: PRICING_CHECKOUT_LOCK,
      metadata: { subtotalZar: Math.round(params.subtotalZar), visitTotalZar: visit },
    });
  }
  return items;
}

/**
 * Monthly dashboard / admin: quoted total ZAR minus persisted extra rows, plus optional reconciliation line.
 */
export function buildMonthlyBundledZarLineItems(params: {
  quotedTotalZar: number | null;
  bundleLabel: string;
  extras: readonly BookingExtraPersistRow[];
}): BookingLineItemInsert[] {
  const extras = [...params.extras];
  const extraSumZar = extras.reduce((s, e) => s + (Number.isFinite(e.price) ? e.price : 0), 0);
  const totalZar =
    params.quotedTotalZar != null && Number.isFinite(params.quotedTotalZar)
      ? Math.round(params.quotedTotalZar)
      : Math.round(extraSumZar);

  if (totalZar <= 0 && extras.length === 0) {
    return [];
  }

  const items: BookingLineItemInsert[] = [];
  const baseZar = totalZar - extraSumZar;

  if (baseZar !== 0 || extras.length === 0) {
    items.push({
      item_type: "base",
      slug: null,
      name: params.bundleLabel,
      quantity: 1,
      unit_price_cents: zarToCents(baseZar),
      total_price_cents: zarToCents(baseZar),
      pricing_source: PRICING_MONTHLY_BUNDLED,
      metadata: { extraSumZar, quotedTotalZar: params.quotedTotalZar },
    });
  }

  for (const e of extras) {
    const p = Math.round(Number.isFinite(e.price) ? e.price : 0);
    items.push({
      item_type: "extra",
      slug: e.slug,
      name: e.name || e.slug,
      quantity: 1,
      unit_price_cents: zarToCents(p),
      total_price_cents: zarToCents(p),
      pricing_source: PRICING_MONTHLY_BUNDLED,
      metadata: {},
    });
  }

  const sumCents = items.reduce((s, r) => s + r.total_price_cents, 0);
  const expectedCents = zarToCents(totalZar);
  if (sumCents !== expectedCents) {
    items.push({
      item_type: "adjustment",
      slug: null,
      name: "Line total reconciliation",
      quantity: 1,
      unit_price_cents: expectedCents - sumCents,
      total_price_cents: expectedCents - sumCents,
      pricing_source: PRICING_MONTHLY_BUNDLED,
      metadata: {},
    });
  }

  return items;
}
