"use client";

import { useMemo } from "react";
import { Loader2, Minus, Plus, X } from "lucide-react";
import { useQuotePricingCatalog } from "@/components/quote/useQuotePricingCatalog";
import {
  extrasForSelectedServices,
  QUOTE_CUSTOM_SERVICE_SLUGS,
  QUOTE_UNSURE_SERVICE_NAME,
  QUOTE_UNSURE_SERVICE_SLUG,
} from "@/lib/quote/quoteSelection";
import type { QuoteCatalogSelection } from "@/lib/quote/types";
import { cn } from "@/lib/utils";

const stepperBtnClass =
  "flex h-9 min-h-9 w-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35";

function selectionKey(item: QuoteCatalogSelection): string {
  return `${item.kind}:${item.slug}`;
}

function serviceRoomNote(bedrooms: number, bathrooms: number): string {
  return bedrooms > 0 || bathrooms > 0 ? ` (${bedrooms} bed, ${bathrooms} bath)` : "";
}

function syncServiceRoomNotes(
  items: QuoteCatalogSelection[],
  bedrooms: number,
  bathrooms: number,
  services: { slug: string; name: string }[],
): QuoteCatalogSelection[] {
  const note = serviceRoomNote(bedrooms, bathrooms);
  return items.map((item) => {
    if (item.kind !== "service") return item;
    const service = services.find((s) => s.slug === item.slug);
    if (!service) return item;
    return { ...item, name: `${service.name}${note}` };
  });
}

function RoomField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      <div className="flex h-11 items-center justify-between rounded-xl border border-slate-200 bg-white px-1">
        <button
          type="button"
          className={stepperBtnClass}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label.toLowerCase()}`}
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-[2ch] text-center text-sm font-semibold tabular-nums text-slate-900">{value}</span>
        <button
          type="button"
          className={stepperBtnClass}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${label.toLowerCase()}`}
        >
          <Plus className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </div>
  );
}

export function QuoteRequestCatalogPicker({
  selected,
  onChange,
  bedrooms,
  bathrooms,
  onBedroomsChange,
  onBathroomsChange,
  className,
}: {
  selected: QuoteCatalogSelection[];
  onChange: (items: QuoteCatalogSelection[]) => void;
  bedrooms: number;
  bathrooms: number;
  onBedroomsChange: (n: number) => void;
  onBathroomsChange: (n: number) => void;
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

  const customQuoteServices = useMemo(
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

    const keptExtras = selected.filter((item) => item.kind === "extra");
    const next: QuoteCatalogSelection[] = [
      {
        kind: "service",
        slug: service.slug,
        name: `${service.name}${serviceRoomNote(bedrooms, bathrooms)}`,
        quantity: 1,
      },
      ...keptExtras,
    ];
    onChange(pruneInvalidExtras(next));
  }

  function handleBedroomsChange(next: number) {
    onBedroomsChange(next);
    onChange(syncServiceRoomNotes(selected, next, bathrooms, customQuoteServices));
  }

  function handleBathroomsChange(next: number) {
    onBathroomsChange(next);
    onChange(syncServiceRoomNotes(selected, bedrooms, next, customQuoteServices));
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
        <p className="mt-0.5 text-sm text-slate-500">Choose the option that best matches your request.</p>
      </div>

      {loading ? (
        <div className="flex min-h-20 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading options…
        </div>
      ) : null}

      {error ? <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      {!loading && !error ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {customQuoteServices.map((service) => {
            const isSelected = selectedKeys.has(`service:${service.slug}`);
            const isUnsure = service.slug === QUOTE_UNSURE_SERVICE_SLUG;
            return (
              <button
                key={service.id}
                type="button"
                onClick={() => selectService(service)}
                aria-pressed={isSelected}
                className={cn(
                  "rounded-xl border p-4 text-left transition",
                  isSelected
                    ? "border-blue-500 bg-blue-50 ring-2 ring-blue-500/10"
                    : "border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/40",
                )}
              >
                <span className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-900">
                    {isUnsure ? "Not sure — help me choose" : service.name}
                  </span>
                  <span className={cn("text-xs font-semibold", isSelected ? "text-blue-700" : "text-blue-600")}>
                    {isSelected ? "Selected" : "Choose"}
                  </span>
                </span>
                <span className="mt-1 block text-xs leading-relaxed text-slate-500">
                  {isUnsure
                    ? "Tell us about the job and our team will recommend the right service."
                    : "For offices, commercial spaces and custom workplace cleaning."}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {selectedServiceSlugs.length > 0 ? (
        <div className="space-y-3">
          {availableExtras.length > 0 ? (
            <details className="rounded-xl border border-slate-200 bg-slate-50/70">
              <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
                Optional add-ons
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
                        <span className="text-xs font-semibold">{added ? "Added" : "+ Add"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </details>
          ) : null}

          <details className="rounded-xl border border-slate-200 bg-slate-50/70">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-slate-700">
              Property size
              <span className="ml-2 text-xs font-normal text-slate-500">
                {bedrooms} bed · {bathrooms} bath
              </span>
            </summary>
            <div className="grid grid-cols-2 gap-3 border-t border-slate-200 p-3">
              <RoomField label="Bedrooms" value={bedrooms} min={1} max={20} onChange={handleBedroomsChange} />
              <RoomField label="Bathrooms" value={bathrooms} min={1} max={20} onChange={handleBathroomsChange} />
            </div>
          </details>

          {selected.filter((item) => item.kind === "extra").length > 0 ? (
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
