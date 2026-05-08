"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import {
  enrichAvailabilitySlotsWithPricing,
  type PricedAvailabilitySlot,
  type RawAvailabilitySlot,
} from "@/lib/booking/enrichAvailabilitySlots";
import { calculateBookingPrice } from "@/lib/pricing/calculateBookingPrice";
import type { ExtraLineItem } from "@/lib/pricing/extrasConfig";
import type { CheckoutQuoteResult, PricingJobInput } from "@/lib/pricing/pricingEngine";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { VipTier } from "@/lib/pricing/vipTier";

export type BookingPriceContextValue = {
  /** Supabase-backed catalog snapshot (null while loading). */
  catalog: PricingRatesSnapshot | null;
  catalogLoading: boolean;
  /** Extras sort order from admin `pricing_extras.sort_order`. */
  orderedExtraSlugs: string[];
  /** Fingerprint of inputs that invalidate the canonical quote. */
  fingerprint: string;
  /** Anchor quote total — same engine as slot list + lock (before time-specific surge). */
  canonicalTotalZar: number | null;
  canonicalDurationHours: number | null;
  breakdown: CheckoutQuoteResult | null;
  extrasLineItems: ExtraLineItem[];
  job: PricingJobInput | null;
  /** Apply canonical job + VIP tier to raw availability rows. */
  priceRawSlots: (raw: RawAvailabilitySlot[]) => PricedAvailabilitySlot[];
};

const BookingPriceContext = createContext<BookingPriceContextValue | null>(null);

type PricingCatalogPayload = {
  snapshot: PricingRatesSnapshot;
  orderedExtraSlugs: string[];
};

let pricingCatalogCache: PricingCatalogPayload | null = null;
let pricingCatalogPromise: Promise<PricingCatalogPayload | null> | null = null;
const canonicalPriceCache = new Map<string, NonNullable<ReturnType<typeof buildCanon>>>();
const MAX_CANONICAL_PRICE_CACHE = 80;

function loadPricingCatalog(): Promise<PricingCatalogPayload | null> {
  if (pricingCatalogCache) return Promise.resolve(pricingCatalogCache);
  if (pricingCatalogPromise) return pricingCatalogPromise;
  pricingCatalogPromise = fetch("/api/pricing/catalog")
    .then((r) => r.json())
    .then((j: { ok?: boolean; snapshot?: PricingRatesSnapshot; orderedExtraSlugs?: string[] }) => {
      if (j?.ok !== true || !j.snapshot) return null;
      pricingCatalogCache = {
        snapshot: j.snapshot,
        orderedExtraSlugs: Array.isArray(j.orderedExtraSlugs) ? j.orderedExtraSlugs : [],
      };
      return pricingCatalogCache;
    })
    .catch(() => null)
    .finally(() => {
      pricingCatalogPromise = null;
    });
  return pricingCatalogPromise;
}

function buildCanon(
  input: {
    service: string | null;
    serviceType: string | null;
    rooms: number;
    bathrooms: number;
    extraRooms: number;
    extras: string[];
  },
  tier: VipTier,
  snapshot: PricingRatesSnapshot | null,
) {
  if (!snapshot || (!input.service && !input.serviceType)) return null;
  return calculateBookingPrice(
    {
      serviceType: input.serviceType ?? input.service,
      bedrooms: input.rooms,
      bathrooms: input.bathrooms,
      extraRooms: input.extraRooms,
      extras: input.extras,
      vipTier: tier,
    },
    snapshot,
  );
}

function cachedBuildCanon(
  fingerprint: string,
  input: Parameters<typeof buildCanon>[0],
  tier: VipTier,
  snapshot: PricingRatesSnapshot | null,
) {
  if (!snapshot || (!input.service && !input.serviceType)) return null;
  const key = `${snapshot.codeVersion}|${fingerprint}`;
  const hit = canonicalPriceCache.get(key);
  if (hit) return hit;
  const next = buildCanon(input, tier, snapshot);
  if (!next) return null;
  if (canonicalPriceCache.size >= MAX_CANONICAL_PRICE_CACHE) {
    const first = canonicalPriceCache.keys().next().value;
    if (first !== undefined) canonicalPriceCache.delete(first);
  }
  canonicalPriceCache.set(key, next);
  return next;
}

export function BookingPriceProvider({ children }: { children: ReactNode }) {
  const { state } = useBookingStep1();
  const { tier } = useBookingVipTier();
  const service = state.service;
  const serviceType = state.service_type;
  const rooms = state.rooms;
  const bathrooms = state.bathrooms;
  const extraRooms = state.extraRooms;
  const extras = state.extras;
  const cleaningFrequency = state.cleaningFrequency;
  const [catalog, setCatalog] = useState<PricingRatesSnapshot | null>(() => pricingCatalogCache?.snapshot ?? null);
  const [orderedExtraSlugs, setOrderedExtraSlugs] = useState<string[]>(() => pricingCatalogCache?.orderedExtraSlugs ?? []);
  const [catalogLoading, setCatalogLoading] = useState(() => pricingCatalogCache == null);

  useEffect(() => {
    let cancelled = false;
    if (pricingCatalogCache) {
      queueMicrotask(() => {
        if (cancelled) return;
        setCatalog(pricingCatalogCache!.snapshot);
        setOrderedExtraSlugs(pricingCatalogCache!.orderedExtraSlugs);
        setCatalogLoading(false);
      });
      return () => {
        cancelled = true;
      };
    }
    queueMicrotask(() => {
      if (!cancelled) setCatalogLoading(true);
    });
    void loadPricingCatalog()
      .then((payload) => {
        if (cancelled || !payload) return;
        setCatalog(payload.snapshot);
        setOrderedExtraSlugs(payload.orderedExtraSlugs);
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const extrasKey = extras.join("\u0001");
  const fingerprint = [
    service ?? "",
    serviceType ?? "",
    rooms,
    bathrooms,
    extraRooms,
    extrasKey,
    cleaningFrequency,
    tier,
  ].join("|");

  const canon = useMemo(
    () =>
      cachedBuildCanon(
        fingerprint,
        {
          service,
          serviceType,
          rooms,
          bathrooms,
          extraRooms,
          extras,
        },
        tier,
        catalog,
      ),
    [fingerprint, catalog, tier, service, serviceType, rooms, bathrooms, extraRooms, extras],
  );

  const priceRawSlots = useCallback(
    (raw: RawAvailabilitySlot[]): PricedAvailabilitySlot[] => {
      if (!canon?.job || !catalog) {
        // Keep the availability grid while catalog hydrates (was `[]`, which blanked every slot until ready).
        return raw.map((s) => ({ ...s }));
      }
      return enrichAvailabilitySlotsWithPricing(raw, canon.job, tier, catalog);
    },
    [canon, tier, catalog],
  );

  const value = useMemo((): BookingPriceContextValue => {
    return {
      catalog,
      catalogLoading,
      orderedExtraSlugs,
      fingerprint,
      canonicalTotalZar: canon?.totalPrice ?? null,
      canonicalDurationHours: canon?.durationHours ?? null,
      breakdown: canon?.breakdown ?? null,
      extrasLineItems: canon?.extrasLineItems ?? [],
      job: canon?.job ?? null,
      priceRawSlots,
    };
  }, [fingerprint, canon, priceRawSlots, catalog, catalogLoading, orderedExtraSlugs]);

  return <BookingPriceContext.Provider value={value}>{children}</BookingPriceContext.Provider>;
}

export function useBookingPrice(): BookingPriceContextValue {
  const ctx = useContext(BookingPriceContext);
  if (!ctx) {
    throw new Error("useBookingPrice must be used within BookingPriceProvider");
  }
  return ctx;
}
