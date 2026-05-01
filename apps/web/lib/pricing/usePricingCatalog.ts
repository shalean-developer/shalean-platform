"use client";

import { useEffect, useState } from "react";
import {
  BOOKING_SERVICE_IDS,
  getServiceById,
  type BookingServiceId,
} from "@/components/booking/serviceCategories";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import type { PricingCatalogExtraMeta } from "@/lib/pricing/usePricingCatalogSnapshot";

export type CatalogService = {
  id: string;
  name: string;
  description?: string;
};

export type CatalogExtra = {
  id: string;
  name: string;
  description?: string;
};

export type PricingCatalogResponse = {
  services: CatalogService[];
  extras: CatalogExtra[];
  snapshot: PricingRatesSnapshot | null;
  extrasMeta: PricingCatalogExtraMeta[];
  orderedExtraSlugs: string[];
};

const FALLBACK_SERVICES: CatalogService[] = [
  { id: "deep", name: "Deep Cleaning", description: "Top-to-bottom refresh for your home." },
  { id: "standard", name: "Standard Cleaning", description: "Regular upkeep, done right." },
  { id: "move", name: "Move-Out Cleaning", description: "Handover-ready, stress-free." },
];

const FALLBACK_EXTRAS: CatalogExtra[] = [
  { id: "inside-fridge", name: "Fridge cleaning" },
  { id: "inside-oven", name: "Oven cleaning" },
  { id: "interior-windows", name: "Window cleaning" },
];

function buildCatalogFromApi(params: {
  snapshot: PricingRatesSnapshot;
  extrasMeta: PricingCatalogExtraMeta[];
  orderedExtraSlugs: string[];
}): PricingCatalogResponse {
  const { snapshot, extrasMeta, orderedExtraSlugs } = params;
  const services: CatalogService[] = [];
  for (const id of BOOKING_SERVICE_IDS) {
    if (!snapshot.services[id as BookingServiceId]) continue;
    const item = getServiceById(id as BookingServiceId);
    services.push({
      id,
      name: item.name,
      description: item.description,
    });
  }
  const metaBySlug = new Map(extrasMeta.map((m) => [m.slug, m] as const));
  const extras: CatalogExtra[] = [];
  const seen = new Set<string>();
  for (const slug of orderedExtraSlugs) {
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const row = snapshot.extras[slug];
    if (!row) continue;
    const meta = metaBySlug.get(slug);
    extras.push({
      id: slug,
      name: meta?.name?.trim() || slug.replace(/-/g, " "),
      description: meta?.description?.trim() || undefined,
    });
  }
  return {
    services,
    extras,
    snapshot,
    extrasMeta,
    orderedExtraSlugs,
  };
}

function fallbackResponse(): PricingCatalogResponse {
  return {
    services: FALLBACK_SERVICES,
    extras: FALLBACK_EXTRAS,
    snapshot: null,
    extrasMeta: [],
    orderedExtraSlugs: FALLBACK_EXTRAS.map((e) => e.id),
  };
}

export function usePricingCatalog(): {
  data: PricingCatalogResponse | null;
  loading: boolean;
  error: string | null;
} {
  const [data, setData] = useState<PricingCatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let cancelled = false;

    async function run() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/pricing/catalog", { signal: ac.signal });
        const j = (await res.json()) as {
          ok?: boolean;
          snapshot?: PricingRatesSnapshot;
          extrasMeta?: PricingCatalogExtraMeta[];
          orderedExtraSlugs?: string[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok || j?.ok !== true || !j.snapshot) {
          console.warn("[usePricingCatalog] catalog unavailable, using UI fallback", j?.error ?? res.status);
          setData(fallbackResponse());
          setError(typeof j?.error === "string" ? j.error : "Catalog unavailable.");
          return;
        }
        const built = buildCatalogFromApi({
          snapshot: j.snapshot,
          extrasMeta: Array.isArray(j.extrasMeta) ? j.extrasMeta : [],
          orderedExtraSlugs: Array.isArray(j.orderedExtraSlugs) ? j.orderedExtraSlugs : [],
        });
        setData(built);
        setError(null);
      } catch (e) {
        if (cancelled || (e instanceof DOMException && e.name === "AbortError")) return;
        console.warn("[usePricingCatalog] fetch failed, using UI fallback", e);
        if (!cancelled) {
          setData(fallbackResponse());
          setError("Network error.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, []);

  return { data, loading, error };
}
