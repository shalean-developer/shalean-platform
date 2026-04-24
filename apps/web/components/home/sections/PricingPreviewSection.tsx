"use client";

import { useMemo } from "react";
import { HomeBookingLink } from "@/components/home/HomeBookingLink";
import { calculateHomeWidgetQuoteZar } from "@/lib/pricing/calculatePrice";
import { usePricingCatalogSnapshot } from "@/lib/pricing/usePricingCatalogSnapshot";
import { cn } from "@/lib/utils";

const samples = [
  { label: "2 bed apartment", service: "standard" as const, bedrooms: 2, bathrooms: 1, extras: [] as string[] },
  { label: "3 bed family home", service: "deep" as const, bedrooms: 3, bathrooms: 2, extras: ["inside-oven"] },
  { label: "Airbnb studio", service: "airbnb" as const, bedrooms: 1, bathrooms: 1, extras: [] as string[] },
];

export function PricingPreviewSection() {
  const { snapshot: catalog } = usePricingCatalogSnapshot();

  const rows = useMemo(() => {
    if (!catalog) return samples.map((row) => ({ ...row, total: null as number | null }));
    return samples.map((row) => ({
      ...row,
      total: calculateHomeWidgetQuoteZar(
        {
          service: row.service,
          bedrooms: row.bedrooms,
          bathrooms: row.bathrooms,
          extraRooms: 0,
          extras: row.extras,
        },
        catalog,
      ),
    }));
  }, [catalog]);

  return (
    <section id="pricing" className="scroll-mt-28 border-b border-blue-100 bg-blue-50/50 py-16" aria-labelledby="pricing-heading">
      <div className="mx-auto max-w-7xl px-4">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="pricing-heading" className="text-3xl font-bold tracking-tight text-zinc-900">
            Cleaning Prices in Cape Town
          </h2>
          <p className="mt-3 text-gray-600">
            Get instant pricing based on your home size, service type, rooms, bathrooms, extras, and preferred time.
          </p>
        </div>

        <ul className="mt-10 grid gap-4 md:grid-cols-3">
          {rows.map((row) => (
            <li
              key={row.label}
              className="rounded-2xl border border-blue-100 bg-white p-6 shadow-sm transition hover:border-blue-200 hover:shadow-md"
            >
              <p className="text-sm font-medium text-blue-600">{row.label}</p>
              <p className="mt-2 text-xs uppercase tracking-wide text-gray-500">{row.service} clean</p>
              <p className="mt-4 text-3xl font-bold text-blue-600">
                {row.total != null ? `R ${row.total.toLocaleString("en-ZA")}` : "—"}
              </p>
              <p className="mt-2 text-sm text-gray-600">Starting estimate. Final price updates live with rooms, extras, and service type.</p>
            </li>
          ))}
        </ul>

        <div className="mx-auto mt-8 grid max-w-4xl gap-3 text-sm text-zinc-700 sm:grid-cols-3">
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <p className="font-semibold text-zinc-900">What affects price?</p>
            <p className="mt-1 text-gray-600">Bedrooms, bathrooms, service type, extras, and slot availability.</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <p className="font-semibold text-zinc-900">No surprises</p>
            <p className="mt-1 text-gray-600">Your exact total is shown before checkout.</p>
          </div>
          <div className="rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <p className="font-semibold text-zinc-900">Fast booking</p>
            <p className="mt-1 text-gray-600">Get your price and secure your slot in minutes.</p>
          </div>
        </div>

        <div className="mx-auto mt-10 max-w-xl text-center">
          <HomeBookingLink
            source="home_pricing_preview"
            className={cn(
              "inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700 sm:w-auto",
            )}
          >
            Get exact price
          </HomeBookingLink>
        </div>
      </div>
    </section>
  );
}
