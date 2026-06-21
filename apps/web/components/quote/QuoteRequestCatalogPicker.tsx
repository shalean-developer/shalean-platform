"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type QuoteCatalogSelection = {
  kind: "service" | "extra";
  slug: string;
  name: string;
  quantity: number;
};

type PublicService = { id: string; slug: string; name: string };
type PublicExtra = {
  id: string;
  slug: string;
  name: string;
  service_type: string;
  is_popular: boolean;
};

function selectionKey(item: QuoteCatalogSelection): string {
  return `${item.kind}:${item.slug}`;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<PublicService[]>([]);
  const [extras, setExtras] = useState<PublicExtra[]>([]);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/public/pricing-catalog", { cache: "no-store" });
      const json = (await res.json()) as {
        services?: PublicService[];
        extras?: PublicExtra[];
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

  const q = query.trim().toLowerCase();
  const selectedKeys = new Set(selected.map(selectionKey));

  const filteredServices = useMemo(() => {
    if (!q) return services;
    return services.filter(
      (s) => s.name.toLowerCase().includes(q) || s.slug.toLowerCase().includes(q),
    );
  }, [services, q]);

  const filteredExtras = useMemo(() => {
    if (!q) return extras;
    return extras.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.slug.toLowerCase().includes(q) ||
        e.service_type.toLowerCase().includes(q),
    );
  }, [extras, q]);

  function addService(service: PublicService) {
    const key = `service:${service.slug}`;
    if (selectedKeys.has(key)) return;
    const roomNote =
      bedrooms > 0 || bathrooms > 0 ? ` (${bedrooms} bed, ${bathrooms} bath)` : "";
    onChange([
      ...selected,
      {
        kind: "service",
        slug: service.slug,
        name: `${service.name}${roomNote}`,
        quantity: 1,
      },
    ]);
  }

  function addExtra(extra: PublicExtra) {
    const key = `extra:${extra.slug}`;
    if (selectedKeys.has(key)) return;
    onChange([
      ...selected,
      { kind: "extra", slug: extra.slug, name: extra.name, quantity: 1 },
    ]);
  }

  function removeItem(item: QuoteCatalogSelection) {
    onChange(selected.filter((s) => selectionKey(s) !== selectionKey(item)));
  }

  return (
    <div className={cn("rounded-2xl border border-slate-200 bg-slate-50/80 p-4", className)}>
      <div>
        <h2 className="text-sm font-semibold text-slate-900">What do you need cleaned?</h2>
        <p className="mt-0.5 text-xs text-slate-500">
          Choose services and add-ons — we&apos;ll price your quote personally.
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
        <p className="mt-3 text-xs text-amber-700">Select at least one service or add-on below.</p>
      )}

      <div className="relative mt-4">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search services and add-ons…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
        <span className="font-medium text-slate-700">Home size</span>
        <label className="flex items-center gap-1.5">
          Beds
          <input
            type="number"
            min={0}
            max={20}
            value={bedrooms}
            onChange={(e) => onBedroomsChange(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
        <label className="flex items-center gap-1.5">
          Baths
          <input
            type="number"
            min={0}
            max={20}
            value={bathrooms}
            onChange={(e) => onBathroomsChange(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading services…
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
                  const added = selectedKeys.has(`service:${service.slug}`);
                  return (
                    <li key={service.id}>
                      <button
                        type="button"
                        disabled={added}
                        onClick={() => addService(service)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition",
                          added
                            ? "border-slate-100 bg-slate-50 text-slate-400"
                            : "border-transparent bg-white hover:border-blue-200 hover:bg-blue-50/50",
                        )}
                      >
                        <span className="font-medium text-slate-800">{service.name}</span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600">
                          {added ? "Added" : <><Plus className="h-3.5 w-3.5" /> Add</>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add-ons</p>
            {filteredExtras.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No matching add-ons.</p>
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
                            <span className="mt-0.5 block text-xs text-slate-500">{extra.service_type}</span>
                          ) : null}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600">
                          {added ? "Added" : <><Plus className="h-3.5 w-3.5" /> Add</>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
