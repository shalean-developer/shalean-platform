"use client";

import { useMemo, useState } from "react";
import { Loader2, Minus, Plus, Search, X } from "lucide-react";
import { useQuotePricingCatalog } from "@/components/quote/useQuotePricingCatalog";
import { extrasForSelectedServices } from "@/lib/quote/quoteSelection";
import type { QuoteCatalogSelection } from "@/lib/quote/types";
import { cn } from "@/lib/utils";

const stepperBtnClass =
  "flex h-10 min-h-10 w-9 min-w-9 shrink-0 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-35";

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

type RoomFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
};

function RoomField({ label, value, min, max, onChange }: RoomFieldProps) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-slate-700">{label}</label>
      <div className="flex h-12 items-center justify-between rounded-xl border border-slate-200 bg-white px-1 shadow-sm">
        <button
          type="button"
          className={stepperBtnClass}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          aria-label={`Decrease ${label.toLowerCase()}`}
          suppressHydrationWarning
        >
          <Minus className="h-4 w-4" aria-hidden />
        </button>
        <span className="min-w-[2ch] text-center text-sm font-bold tabular-nums text-slate-900">{value}</span>
        <button
          type="button"
          className={stepperBtnClass}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          aria-label={`Increase ${label.toLowerCase()}`}
          suppressHydrationWarning
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
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const selectedKeys = new Set(selected.map(selectionKey));
  const selectedServiceSlugs = useMemo(
    () => selected.filter((item) => item.kind === "service").map((item) => item.slug),
    [selected],
  );

  const availableExtras = useMemo(
    () => extrasForSelectedServices(selectedServiceSlugs, services, extras),
    [selectedServiceSlugs, services, extras],
  );

  const filteredServices = useMemo(() => {
    if (!q) return services;
    return services.filter(
      (service) =>
        service.name.toLowerCase().includes(q) || service.slug.toLowerCase().includes(q),
    );
  }, [services, q]);

  const filteredExtras = useMemo(() => {
    if (selectedServiceSlugs.length === 0) return [];
    if (!q) return availableExtras;
    return availableExtras.filter(
      (extra) =>
        extra.name.toLowerCase().includes(q) ||
        extra.slug.toLowerCase().includes(q) ||
        extra.service_type.toLowerCase().includes(q),
    );
  }, [availableExtras, q, selectedServiceSlugs.length]);

  function pruneInvalidExtras(items: QuoteCatalogSelection[]): QuoteCatalogSelection[] {
    const slugs = items.filter((item) => item.kind === "service").map((item) => item.slug);
    const allowed = new Set(extrasForSelectedServices(slugs, services, extras).map((e) => e.slug));
    return items.filter((item) => item.kind === "service" || allowed.has(item.slug));
  }

  function selectService(service: { id: string; slug: string; name: string }) {
    const key = `service:${service.slug}`;
    if (selectedKeys.has(key)) return;

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
    onChange(syncServiceRoomNotes(selected, next, bathrooms, services));
  }

  function handleBathroomsChange(next: number) {
    onBathroomsChange(next);
    onChange(syncServiceRoomNotes(selected, bedrooms, next, services));
  }

  function addExtra(extra: { slug: string; name: string }) {
    const key = `extra:${extra.slug}`;
    if (selectedKeys.has(key)) return;
    onChange([...selected, { kind: "extra", slug: extra.slug, name: extra.name, quantity: 1 }]);
  }

  function removeItem(item: QuoteCatalogSelection) {
    const next = selected.filter((s) => selectionKey(s) !== selectionKey(item));
    onChange(item.kind === "service" ? pruneInvalidExtras(next) : next);
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-slate-50/80 p-4", className)}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">What do you need cleaned?</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Choose one service — matching add-ons appear below.
        </p>
      </div>

      {selected.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {selected.map((item) => (
            <li
              key={selectionKey(item)}
              className="flex items-center justify-between gap-2 rounded-xl border border-blue-100 bg-white px-3 py-2 text-sm"
            >
              <span className="font-medium text-slate-800">{item.name}</span>
              <button
                type="button"
                onClick={() => removeItem(item)}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                aria-label={`Remove ${item.name}`}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-xs text-amber-700">Select a service below.</p>
      )}

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services and add-ons…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
          suppressHydrationWarning
        />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4">
        <RoomField label="Bedrooms" value={bedrooms} min={1} max={20} onChange={handleBedroomsChange} />
        <RoomField label="Bathrooms" value={bathrooms} min={1} max={20} onChange={handleBathroomsChange} />
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading services…
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      {!loading && !error ? (
        <div className="mt-4 space-y-4">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Services</p>
            {filteredServices.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No matching services.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {filteredServices.map((service) => {
                  const selectedService = selectedKeys.has(`service:${service.slug}`);
                  return (
                    <li key={service.id}>
                      <button
                        type="button"
                        onClick={() => selectService(service)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition",
                          selectedService
                            ? "border-blue-200 bg-blue-50 text-blue-800"
                            : "border-transparent bg-white hover:border-blue-200 hover:bg-blue-50/50",
                        )}
                        aria-pressed={selectedService}
                      >
                        <span className="font-medium">{service.name}</span>
                        <span
                          className={cn(
                            "inline-flex shrink-0 items-center gap-1 text-xs font-semibold",
                            selectedService ? "text-blue-700" : "text-blue-600",
                          )}
                        >
                          {selectedService ? (
                            "Selected"
                          ) : (
                            <>
                              <Plus className="h-3.5 w-3.5" aria-hidden /> Select
                            </>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selectedServiceSlugs.length > 0 ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add-ons</p>
              <p className="mt-1 text-xs text-slate-500">
                Optional extras for{" "}
                {selected.find((item) => item.kind === "service")?.name.split(" (")[0] ?? "your service"}.
              </p>
              {filteredExtras.length === 0 ? (
                <p className="mt-2 text-xs text-slate-400">
                  {q ? "No matching add-ons for your selected service." : "No add-ons for your selected service."}
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {filteredExtras.map((extra) => {
                    const added = selectedKeys.has(`extra:${extra.slug}`);
                    return (
                      <li key={extra.id}>
                        <button
                          type="button"
                          disabled={added}
                          onClick={() => addExtra(extra)}
                          className={cn(
                            "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition",
                            added
                              ? "border-slate-100 bg-slate-50 text-slate-400"
                              : "border-transparent bg-white hover:border-blue-200 hover:bg-blue-50/50",
                          )}
                        >
                          <span className="min-w-0">
                            <span className="font-medium text-slate-800">{extra.name}</span>
                            {extra.service_type !== "all" ? (
                              <span className="mt-0.5 block text-xs capitalize text-slate-500">
                                {extra.service_type}
                              </span>
                            ) : null}
                          </span>
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600">
                            {added ? (
                              "Added"
                            ) : (
                              <>
                                <Plus className="h-3.5 w-3.5" aria-hidden /> Add
                              </>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
