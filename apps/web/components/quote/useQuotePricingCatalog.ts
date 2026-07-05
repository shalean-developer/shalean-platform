"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuotePublicExtra, QuotePublicService } from "@/lib/quote/types";

export type { QuotePublicExtra, QuotePublicService };

export function useQuotePricingCatalog() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<QuotePublicService[]>([]);
  const [extras, setExtras] = useState<QuotePublicExtra[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/pricing-catalog", { cache: "no-store" });
      const json = (await res.json()) as {
        services?: QuotePublicService[];
        extras?: QuotePublicExtra[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not load services.");
      setServices(json.services ?? []);
      setExtras(json.extras ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load services.");
      setServices([]);
      setExtras([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { services, extras, loading, error, reload: load };
}
