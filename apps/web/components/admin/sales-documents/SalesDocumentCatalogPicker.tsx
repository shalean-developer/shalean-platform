"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Plus, Search } from "lucide-react";
import { getAdminToken } from "@/hooks/useAdminData";
import type { PricingExtraRow, PricingServiceRow } from "@/lib/admin/officePricingTypes";
import { cn } from "@/lib/utils";

export type CatalogLineInput = {
  description: string;
  quantity: number;
  unit_price_cents: number;
};

function formatZar(amount: number): string {
  return `R ${Math.round(amount).toLocaleString("en-ZA")}`;
}

function serviceVisitPriceZar(
  service: PricingServiceRow,
  bedrooms: number,
  bathrooms: number,
): number {
  const beds = Math.max(0, Math.round(bedrooms));
  const baths = Math.max(0, Math.round(bathrooms));
  return Math.round(
    Number(service.base_price) +
      beds * Number(service.price_per_bedroom) +
      baths * Number(service.price_per_bathroom),
  );
}

function servicePriceHint(service: PricingServiceRow): string {
  const bed = Number(service.price_per_bedroom);
  const bath = Number(service.price_per_bathroom);
  if (bed <= 0 && bath <= 0) return formatZar(service.base_price);
  const parts = [formatZar(service.base_price) + " base"];
  if (bed > 0) parts.push(`+${formatZar(bed)}/bed`);
  if (bath > 0) parts.push(`+${formatZar(bath)}/bath`);
  return parts.join(" · ");
}

export function SalesDocumentCatalogPicker({
  onAddLine,
  className,
}: {
  onAddLine: (line: CatalogLineInput) => void;
  className?: string;
}) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [services, setServices] = useState<PricingServiceRow[]>([]);
  const [extras, setExtras] = useState<PricingExtraRow[]>([]);
  const [query, setQuery] = useState("");
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const mountedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setError(null);
    const token = await getAdminToken();
    if (!token) {
      if (!mountedRef.current) return;
      setError("Sign in as admin to load catalog.");
      setLoading(false);
      return;
    }
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const [sRes, eRes] = await Promise.all([
        fetch("/api/admin/pricing-services", { headers, cache: "no-store" }),
        fetch("/api/admin/pricing-extras", { headers, cache: "no-store" }),
      ]);
      const sJson = (await sRes.json()) as { services?: PricingServiceRow[]; error?: string };
      const eJson = (await eRes.json()) as { extras?: PricingExtraRow[]; error?: string };
      if (!sRes.ok) throw new Error(sJson.error ?? "Could not load services.");
      if (!eRes.ok) throw new Error(eJson.error ?? "Could not load extras.");
      if (!mountedRef.current) return;
      setServices((sJson.services ?? []).filter((s) => s.is_active));
      setExtras((eJson.extras ?? []).filter((e) => e.is_active));
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Could not load catalog.");
      setServices([]);
      setExtras([]);
    }
    if (mountedRef.current) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const q = query.trim().toLowerCase();

  const filteredServices = useMemo(() => {
    if (!q) return services;
    return services.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q),
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

  function addService(service: PricingServiceRow) {
    const zar = serviceVisitPriceZar(service, bedrooms, bathrooms);
    const roomNote =
      bedrooms > 0 || bathrooms > 0 ? ` (${bedrooms} bed, ${bathrooms} bath)` : "";
    onAddLine({
      description: `${service.name}${roomNote}`,
      quantity: 1,
      unit_price_cents: Math.round(zar * 100),
    });
  }

  function addExtra(extra: PricingExtraRow) {
    onAddLine({
      description: extra.name,
      quantity: 1,
      unit_price_cents: Math.round(Number(extra.price) * 100),
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Service catalog</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            From{" "}
            <Link href="/office/pricing" className="font-medium text-blue-600 hover:underline">
              Office pricing
            </Link>
            — click to add a line.
          </p>
        </div>
      </div>

      <div className="relative mt-3">
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
        <span className="font-medium text-slate-700">Visit sizing (services)</span>
        <label className="flex items-center gap-1.5">
          Beds
          <input
            type="number"
            min={0}
            max={20}
            value={bedrooms}
            onChange={(e) => setBedrooms(Math.max(0, Number(e.target.value) || 0))}
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
            onChange={(e) => setBathrooms(Math.max(0, Number(e.target.value) || 0))}
            className="w-14 rounded-lg border border-slate-200 px-2 py-1 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading catalog…
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-sm text-red-600">{error}</p>
      ) : null}

      {!loading && !error ? (
        <div className="mt-4 space-y-4">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Services</p>
            {filteredServices.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">No matching services.</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {filteredServices.map((service) => {
                  const visitZar = serviceVisitPriceZar(service, bedrooms, bathrooms);
                  return (
                    <li key={service.id}>
                      <button
                        type="button"
                        onClick={() => addService(service)}
                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-white px-3 py-2 text-left text-sm hover:border-blue-200 hover:bg-blue-50/50"
                      >
                        <span className="min-w-0">
                          <span className="font-medium text-slate-800">{service.name}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">
                            {servicePriceHint(service)} → {formatZar(visitZar)} for this visit
                          </span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600">
                          <Plus className="h-3.5 w-3.5" /> Add
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
                {filteredExtras.map((extra) => (
                  <li key={extra.id}>
                    <button
                      type="button"
                      onClick={() => addExtra(extra)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-transparent bg-white px-3 py-2 text-left text-sm hover:border-blue-200 hover:bg-blue-50/50"
                    >
                      <span className="min-w-0">
                        <span className="font-medium text-slate-800">{extra.name}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {formatZar(extra.price)}
                          {extra.service_type !== "all" ? ` · ${extra.service_type}` : ""}
                        </span>
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-blue-600">
                        <Plus className="h-3.5 w-3.5" /> Add
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}
