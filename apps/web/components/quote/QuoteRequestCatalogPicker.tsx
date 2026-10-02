"use client";

import { useMemo } from "react";
import { Loader2, X } from "lucide-react";
import { useQuotePricingCatalog } from "@/components/quote/useQuotePricingCatalog";
import {
  extrasForSelectedServices,
  QUOTE_CUSTOM_SERVICE_SLUGS,
  QUOTE_UNSURE_SERVICE_NAME,
  QUOTE_UNSURE_SERVICE_SLUG,
} from "@/lib/quote/quoteSelection";
import type { QuoteCatalogSelection } from "@/lib/quote/types";
import { cn } from "@/lib/utils";

function selectionKey(item: QuoteCatalogSelection): string {
  return `${item.kind}:${item.slug}`;
}

const SERVICE_HELP: Record<string, string> = {
  standard: "Regular home cleaning for ongoing or once-off needs.",
  deep: "A more detailed top-to-bottom clean.",
  move: "Move-in or move-out cleaning.",
  office: "Offices, commercial spaces and workplace cleaning.",
  carpet: "Carpets, rugs and related fabric cleaning.",
  airbnb: "Guest-ready Airbnb and short-stay turnover cleaning.",
};

export function QuoteRequestCatalogPicker({
  selected,
  onChange,
  className,
}: {
  selected: QuoteCatalogSelection[];
  onChange: (items: QuoteCatalogSelection[]) => void;
  className?: string;
}) {
  const { services, extras, loading, error } = useQuotePricingCatalog();

  const selectedKeys = new Set(selected.map(selectionKey));
  const selectedServiceSlugs = useMemo(
    () => selected.filter((item) => item.kind === "service").map((item) => item.slug),
    [selected],
  );

  const availableExtras = useMemo(
    () => extrasForSelectedServices(selectedServiceSlugs, services, extras),
    [selectedServiceSlugs, services, extras],
  );

  const quoteServices = useMemo(
    () => [
      ...services.filter((service) => QUOTE_CUSTOM_SERVICE_SLUGS.has(service.slug)),
      { id: QUOTE_UNSURE_SERVICE_SLUG, slug: QUOTE_UNSURE_SERVICE_SLUG, name: QUOTE_UNSURE_SERVICE_NAME },
    ],
    [services],
  );

  function pruneInvalidExtras(items: QuoteCatalogSelection[]): QuoteCatalogSelection[] {
    const slugs = items.filter((item) => item.kind === "service").map((item) => item.slug);
    const allowed = new Set(extrasForSelectedServices(slugs, services, extras).map((e) => e.slug));
    return items.filter((item) => item.kind === "service" || allowed.has(item.slug));
  }

  function selectService(service: { id: string; slug: string; name: string }) {
    if (selectedKeys.has(`service:${service.slug}`)) return;

    const next: QuoteCatalogSelection[] = [
      {
        kind: "service",
        slug: service.slug,
        name: service.name,
        quantity: 1,
      },
    ];
    onChange(pruneInvalidExtras(next));
  }

  function addExtra(extra: { slug: string; name: string }) {
    if (selectedKeys.has(`extra:${extra.slug}`)) return;
    onChange([...selected, { kind: "extra", slug: extra.slug, name: extra.name, quantity: 1 }]);
  }

  function removeItem(item: QuoteCatalogSelection) {
    const next = selected.filter((s) => selectionKey(s) !== selectionKey(item));
    onChange(item.kind === "service" ? pruneInvalidExtras(next) : next);
  }

  return (
    <section className={cn("space-y-3", className)}>
      <div>
        <h2 className="text-base font-semibold text-slate-900">What do you need?</h2>
        <p className="mt-0.5 text-sm text-slate-500">Choose one service. You can add extras after selecting it.</p>
      </div>

      {loading ? (
        <div className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading services…
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {quoteServices.map((service) => {
            const isSelected = selectedKeys.has(`service:${service.slug}`);
            const isUnsure = service.slug === QUOTE_UNSURE_SERVICE_SLUG;

            return (
              <button
                key={service.id}
                type="button"
                onClick={() => selectService(service)}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-xl border px-4 py-3 text-left transition",
                  isSelected
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/10"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">
                    {isUnsure ? "Not sure — help me choose" : service.name}
                  </span>
                  <span className={cn("shrink-0 text-xs font-semibold", isSelected ? "text-blue-700" : "text-blue-600")}>
                    {isSelected ? "Selected" : "Choose"}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  {isUnsure
                    ? "Tell us about the job and our team will recommend the right service."
                    : SERVICE_HELP[service.slug] ?? "Request a personalised cleaning quote."}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedServiceSlugs.length > 0 && selectedServiceSlugs[0] !== QUOTE_UNSURE_SERVICE_SLUG ? (
        <div className="space-y-2">
          {availableExtras.length > 0 ? (
            <details className="rounded-xl border border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                Add extras
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({selected.filter((item) => item.kind === "extra").length} selected)
                </span>
              </summary>
              <div className="border-t border-slate-200 p-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  {availableExtras.map((extra) => {
                    const added = selectedKeys.has(`extra:${extra.slug}`);
                    const selectedItem = selected.find(
                      (item) => item.kind === "extra" && item.slug === extra.slug,
                    );

                    return (
                      <button
                        key={extra.id}
                        type="button"
                        onClick={() => (added && selectedItem ? removeItem(selectedItem) : addExtra(extra))}
                        className={cn(
                          "flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm",
                          added
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : "border-slate-200 bg-white text-slate-700 hover:border-blue-200",
                        )}
                      >
                        <span className="font-medium">{extra.name}</span>
                        <span className="shrink-0 text-xs font-semibold">{added ? "Added" : "+ Add"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>
          ) : (
            <p className="text-xs text-slate-500">No optional extras are currently available for this service.</p>
          )}

          {selected.some((item) => item.kind === "extra") ? (
            <div className="flex flex-wrap gap-2">
              {selected.filter((item) => item.kind === "extra").map((item) => (
                <button
                  key={selectionKey(item)}
                  type="button"
                  onClick={() => removeItem(item)}
                  className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-3 py-1.5 text-xs font-medium text-blue-700"
                  aria-label={`Remove ${item.name}`}
                >
                  {item.name}
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
