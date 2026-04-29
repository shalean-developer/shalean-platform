"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BOOKING_DATA_STORAGE_KEY } from "@/lib/booking/bookingWidgetDraft";
import { defaultBookingTimeForDate, todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import { bookingFlowHref, bookingFlowPromoExtra } from "@/lib/booking/bookingFlow";
import {
  calculateHomeWidgetQuoteZar,
  type HomeWidgetServiceKey,
} from "@/lib/pricing/calculatePrice";
import { usePricingCatalogSnapshot } from "@/lib/pricing/usePricingCatalogSnapshot";
import { cn } from "@/lib/utils";

const SERVICE_OPTIONS: { label: string; value: HomeWidgetServiceKey }[] = [
  { label: "Standard", value: "standard" },
  { label: "Deep", value: "deep" },
  { label: "Airbnb", value: "airbnb" },
  { label: "Move-in / out", value: "move" },
  { label: "Carpet", value: "carpet" },
];

const EXTRA_OPTIONS: { id: string; label: string }[] = [
  { id: "inside-oven", label: "Inside oven" },
  { id: "inside-fridge", label: "Inside fridge" },
  { id: "interior-windows", label: "Interior windows" },
  { id: "inside-cabinets", label: "Inside cabinets" },
];

const fieldClass =
  "w-full rounded-xl border border-blue-200 bg-white px-3 py-2.5 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-blue-700";

export function HeroBookingWidgetCard() {
  const router = useRouter();
  const { snapshot: catalog } = usePricingCatalogSnapshot();
  const [service, setService] = useState<HomeWidgetServiceKey>("standard");
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(2);
  const [extras, setExtras] = useState<string[]>([]);

  const price = useMemo(() => {
    if (!catalog) return null;
    return calculateHomeWidgetQuoteZar(
      {
        service,
        bedrooms,
        bathrooms: Math.min(3, bathrooms),
        extraRooms: 0,
        extras,
      },
      catalog,
    );
  }, [catalog, service, bedrooms, bathrooms, extras]);

  function toggleExtra(id: string) {
    setExtras((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function handleContinue() {
    const date = todayBookingYmd();
    const time = defaultBookingTimeForDate(date);
    const payload = {
      estimateOnly: false as const,
      bedrooms,
      bathrooms: Math.min(3, bathrooms),
      extraRooms: 0,
      service,
      date,
      time,
      extras,
      location: "",
      quotedPriceZar: price ?? 0,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(BOOKING_DATA_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* ignore */
    }
    const href = `${bookingFlowHref("entry", bookingFlowPromoExtra("SAVE10"))}&source=home_hero_widget`;
    router.push(href);
  }

  return (
    <div
      id="hero-booking"
      className={cn(
        "w-full max-w-md rounded-2xl border border-blue-100 bg-white p-6 shadow-xl shadow-blue-900/10",
        "lg:sticky lg:top-24",
      )}
    >
      <p className="text-lg font-semibold text-zinc-900">Quick quote</p>
      <p className="mt-1 text-sm text-gray-600">Tune details — your total updates instantly before you continue.</p>

      <div className="mt-5 space-y-4">
        <div>
          <label className={labelClass} htmlFor="hero-service">
            Service type
          </label>
          <select
            id="hero-service"
            className={cn(fieldClass, "mt-1.5 h-11")}
            value={service}
            onChange={(e) => setService(e.target.value as HomeWidgetServiceKey)}
          >
            {SERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass} htmlFor="hero-bedrooms">
              Bedrooms
            </label>
            <select id="hero-bedrooms" className={cn(fieldClass, "mt-1.5 h-11")} value={bedrooms} onChange={(e) => setBedrooms(Number(e.target.value))}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="hero-bathrooms">
              Bathrooms
            </label>
            <select
              id="hero-bathrooms"
              className={cn(fieldClass, "mt-1.5 h-11")}
              value={bathrooms}
              onChange={(e) => setBathrooms(Number(e.target.value))}
            >
              {[1, 2, 3, 4].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <p className={labelClass}>Extras</p>
          <ul className="mt-2 space-y-2">
            {EXTRA_OPTIONS.map((ex) => (
              <li key={ex.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-blue-100 px-3 py-2 text-sm transition hover:border-blue-200 hover:bg-blue-50/60">
                  <input
                    type="checkbox"
                    checked={extras.includes(ex.id)}
                    onChange={() => toggleExtra(ex.id)}
                    className="size-4 rounded border-blue-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-zinc-800">{ex.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-blue-700">Estimated total</p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-blue-600">
            {price != null ? `R ${price.toLocaleString("en-ZA")}` : "—"}
          </p>
          <p className="mt-1 text-xs text-gray-600">Final price confirmed at checkout after you choose your slot.</p>
        </div>

        <button
          type="button"
          onClick={() => void handleContinue()}
          className="w-full rounded-xl bg-blue-600 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 active:scale-[0.99]"
        >
          Continue Booking
        </button>
      </div>
    </div>
  );
}
