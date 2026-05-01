"use client";

import { useEffect, useMemo } from "react";
import { ServiceGrid } from "@/components/booking/ServiceGrid";
import type { CatalogService } from "@/lib/pricing/usePricingCatalog";

type ServiceStepProps = {
  value: string;
  onChange: (service: string) => void;
  services: CatalogService[];
  loading: boolean;
};

export function ServiceStep({ value, onChange, services, loading }: ServiceStepProps) {
  const enabledIds = useMemo(() => new Set(services.map((s) => s.id)), [services]);

  useEffect(() => {
    if (loading || services.length === 0) return;
    if (enabledIds.has(value)) return;
    const first = services[0]?.id;
    if (first) onChange(first);
  }, [loading, services, value, onChange, enabledIds]);

  if (loading) {
    return (
      <>
        <div
          className="grid grid-cols-3 place-items-center gap-x-4 gap-y-6 lg:hidden"
          aria-hidden
        >
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex w-full max-w-[5.5rem] flex-col items-center">
              <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-zinc-200 dark:bg-zinc-700" />
              <div className="mt-2 h-3 w-14 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
            </div>
          ))}
        </div>
        <div className="hidden grid-cols-3 gap-4 lg:grid" aria-hidden>
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex min-h-[5.5rem] animate-pulse flex-col rounded-xl border border-gray-200 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900"
            >
              <div className="mb-2 flex items-center gap-3">
                <div className="h-9 w-9 shrink-0 rounded-lg bg-zinc-200 dark:bg-zinc-700" />
                <div className="h-4 w-24 rounded bg-zinc-200 dark:bg-zinc-700" />
              </div>
              <div className="h-3 w-full rounded bg-zinc-200/80 dark:bg-zinc-700/80" />
              <div className="mt-1.5 h-3 w-[92%] rounded bg-zinc-200/70 dark:bg-zinc-700/70" />
            </div>
          ))}
        </div>
      </>
    );
  }

  return <ServiceGrid value={value} onChange={onChange} enabledIds={enabledIds} />;
}
