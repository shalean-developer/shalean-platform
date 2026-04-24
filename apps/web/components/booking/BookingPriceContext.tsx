"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { BookingStep1State } from "@/components/booking/useBookingStep1";
import { useBookingStep1 } from "@/components/booking/useBookingStep1";
import { useBookingVipTier } from "@/components/booking/useBookingVipTier";
import { bookingPricingFingerprint } from "@/lib/booking/bookingPricingFingerprint";
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

function buildCanon(state: BookingStep1State, tier: VipTier, snapshot: PricingRatesSnapshot | null) {
  if (!snapshot || (!state.service && !state.service_type)) return null;
  return calculateBookingPrice(
    {
      serviceType: state.service_type ?? state.service,
      bedrooms: state.rooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      extras: state.extras,
      vipTier: tier,
    },
    snapshot,
  );
}

export function BookingPriceProvider({ children }: { children: ReactNode }) {
  const { state } = useBookingStep1();
  const { tier } = useBookingVipTier();
  const [catalog, setCatalog] = useState<PricingRatesSnapshot | null>(null);
  const [orderedExtraSlugs, setOrderedExtraSlugs] = useState<string[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setCatalogLoading(true);
    void fetch("/api/pricing/catalog")
      .then((r) => r.json())
      .then((j: { ok?: boolean; snapshot?: PricingRatesSnapshot; orderedExtraSlugs?: string[] }) => {
        if (cancelled || j?.ok !== true || !j.snapshot) return;
        setCatalog(j.snapshot);
        setOrderedExtraSlugs(Array.isArray(j.orderedExtraSlugs) ? j.orderedExtraSlugs : []);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const extrasKey = state.extras.join("\u0001");

  const fingerprint = useMemo(
    () => bookingPricingFingerprint(state, tier),
    [
      state.service,
      state.service_type,
      state.rooms,
      state.bathrooms,
      state.extraRooms,
      extrasKey,
      state.cleaningFrequency,
      tier,
    ],
  );

  const canon = useMemo(() => buildCanon(state, tier, catalog), [fingerprint, tier, catalog]);

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
