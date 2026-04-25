"use client";

import { useEffect, useState } from "react";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

export type PricingCatalogExtraMeta = {
  slug: string;
  name: string | null;
  description: string | null;
  is_popular: boolean | null;
  sort_order: number | null;
  service_type: string | null;
  price: number;
};

/** Client fetch of public catalog — same payload as `BookingPriceProvider`. */
export function usePricingCatalogSnapshot(): {
  snapshot: PricingRatesSnapshot | null;
  extrasMeta: PricingCatalogExtraMeta[];
  orderedExtraSlugs: string[];
  loading: boolean;
} {
  const [snapshot, setSnapshot] = useState<PricingRatesSnapshot | null>(null);
  const [extrasMeta, setExtrasMeta] = useState<PricingCatalogExtraMeta[]>([]);
  const [orderedExtraSlugs, setOrderedExtraSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/pricing/catalog")
      .then((r) => r.json())
      .then(
        (j: {
          ok?: boolean;
          snapshot?: PricingRatesSnapshot;
          extrasMeta?: PricingCatalogExtraMeta[];
          orderedExtraSlugs?: string[];
        }) => {
        if (cancelled || j?.ok !== true || !j.snapshot) return;
        setSnapshot(j.snapshot);
        setExtrasMeta(Array.isArray(j.extrasMeta) ? j.extrasMeta : []);
        setOrderedExtraSlugs(Array.isArray(j.orderedExtraSlugs) ? j.orderedExtraSlugs : []);
      },
      )
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { snapshot, extrasMeta, orderedExtraSlugs, loading };
}
