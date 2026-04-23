"use client";

import { useEffect, useState } from "react";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

/** Client fetch of public catalog — same payload as `BookingPriceProvider`. */
export function usePricingCatalogSnapshot(): {
  snapshot: PricingRatesSnapshot | null;
  loading: boolean;
} {
  const [snapshot, setSnapshot] = useState<PricingRatesSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch("/api/pricing/catalog")
      .then((r) => r.json())
      .then((j: { ok?: boolean; snapshot?: PricingRatesSnapshot }) => {
        if (cancelled || j?.ok !== true || !j.snapshot) return;
        setSnapshot(j.snapshot);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { snapshot, loading };
}
