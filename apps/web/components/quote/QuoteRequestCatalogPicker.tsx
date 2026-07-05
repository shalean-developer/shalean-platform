"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { QUOTE_UNSURE_SERVICE_SLUG, QUOTE_UNSURE_SERVICE_NAME } from "@/lib/quote/quoteSelection";
import type { QuotePublicService } from "@/lib/quote/types";

type Props = {
  services: QuotePublicService[];
  loading: boolean;
  error: string | null;
  primaryServiceSlug: string | null;
  onPrimaryServiceChange: (slug: string) => void;
  className?: string;
};

export function QuoteRequestCatalogPicker({
  services,
  loading,
  error,
  primaryServiceSlug,
  onPrimaryServiceChange,
  className,
}: Props) {
  return (
    <div className={cn("space-y-5", className)}>
      <div>
        <h2 className="text-base font-semibold text-slate-900">What type of cleaning do you need?</h2>
        <p className="mt-1 text-sm text-slate-500">Pick one main service to continue.</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading services…
        </div>
      ) : null}

      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {services.map((service) => {
            const selected = primaryServiceSlug === service.slug;
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => onPrimaryServiceChange(service.slug)}
                className={cn(
                  "rounded-xl border-2 px-3 py-3 text-left text-sm font-semibold transition",
                  selected
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-slate-200 bg-white text-slate-800 hover:border-blue-200 hover:bg-blue-50/40",
                )}
                aria-pressed={selected}
              >
                {service.name}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => onPrimaryServiceChange(QUOTE_UNSURE_SERVICE_SLUG)}
            className={cn(
              "col-span-2 rounded-xl border-2 border-dashed px-3 py-3 text-left text-sm font-semibold transition sm:col-span-3",
              primaryServiceSlug === QUOTE_UNSURE_SERVICE_SLUG
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50/40",
            )}
            aria-pressed={primaryServiceSlug === QUOTE_UNSURE_SERVICE_SLUG}
          >
            {QUOTE_UNSURE_SERVICE_NAME}
          </button>
        </div>
      ) : null}
    </div>
  );
}
