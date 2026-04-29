"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { HomeService } from "@/lib/home/data";
import { BOOKING_DATA_STORAGE_KEY } from "@/lib/booking/bookingWidgetDraft";
import { bookingFlowHref, bookingFlowPromoExtra } from "@/lib/booking/bookingFlow";
import { defaultBookingTimeForDate, todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import { calculateHomeWidgetQuoteZar, type HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { usePricingCatalogSnapshot } from "@/lib/pricing/usePricingCatalogSnapshot";
import { Button } from "@/components/ui/button";
import { AddOnsSelector, iconForAddOn, type AddOn } from "@/components/booking/AddOnsSelector";
import { cn } from "@/lib/utils";
import { bookingCopy } from "@/lib/booking/copy";
import { ServiceAreaPicker } from "@/components/booking/ServiceAreaPicker";
import { ROOM_FIELD_LABEL_CLASS, ROOM_TEXT_INPUT_CLASS } from "@/components/ui/floating-select";

type BookingWidgetProps = {
  services: HomeService[];
};

const fieldClass =
  "h-11 w-full rounded-xl border border-blue-200 bg-white px-3 text-sm text-zinc-900 shadow-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20";

function formatZar(value: number): string {
  return `R ${value.toLocaleString("en-ZA")}`;
}

export function BookingWidget({ services }: BookingWidgetProps) {
  const router = useRouter();
  const { snapshot, extrasMeta, loading: pricingLoading } = usePricingCatalogSnapshot();
  const availableServices = services;
  const [service, setService] = useState<HomeWidgetServiceKey>(availableServices[0]?.id ?? "standard");
  const [bedrooms, setBedrooms] = useState(2);
  const [bathrooms, setBathrooms] = useState(1);
  const [selectedAddOns, setSelectedAddOns] = useState<string[]>([]);
  const [street, setStreet] = useState("");
  const [serviceAreaLocationId, setServiceAreaLocationId] = useState<string | null>(null);
  const [serviceAreaCityId, setServiceAreaCityId] = useState<string | null>(null);
  const [serviceAreaName, setServiceAreaName] = useState("");
  const entryCopy = bookingCopy.entry;

  const selectedService = availableServices.find((item) => item.id === service) ?? availableServices[0] ?? null;
  const addOns = useMemo<AddOn[]>(
    () =>
      extrasMeta.map((extra) => ({
        id: extra.slug,
        label: extra.name ?? extra.slug,
        price: Math.round(Number(extra.price) || 0),
        icon: iconForAddOn(extra.slug),
      })),
    [extrasMeta],
  );

  const basePrice = useMemo(() => {
    if (snapshot) {
      return calculateHomeWidgetQuoteZar({ service, bedrooms, bathrooms, extraRooms: 0, extras: [] }, snapshot);
    }
    return selectedService?.price ?? 0;
  }, [bathrooms, bedrooms, selectedService?.price, service, snapshot]);

  const extrasTotal = selectedAddOns.reduce((sum, id) => {
    const found = addOns.find((addOn) => addOn.id === id);
    return sum + (found?.price ?? 0);
  }, 0);

  const total = basePrice + extrasTotal;
  const canContinue = Boolean(selectedService && total > 0 && serviceAreaLocationId);

  const handleToggle = (id: string) => {
    setSelectedAddOns((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  function handleContinue() {
    if (!canContinue) return;
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
      extras: selectedAddOns,
      location: street.trim().slice(0, 500),
      serviceAreaLocationId,
      serviceAreaCityId,
      serviceAreaName: serviceAreaName.trim().slice(0, 120),
      quotedPriceZar: total,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(BOOKING_DATA_STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* Storage can be unavailable in private browsing. */
    }
    router.push(`${bookingFlowHref("entry", bookingFlowPromoExtra("SAVE10"))}&source=home_hero_widget`);
  }

  return (
    <div
      id="hero-booking"
      className={cn(
        "w-full rounded-3xl border border-blue-100 bg-white p-5 shadow-2xl shadow-blue-950/10 sm:p-6",
        "lg:sticky lg:top-24",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-lg font-semibold text-zinc-950">Instant quote</p>
          <p className="mt-1 text-sm text-zinc-600">Choose your clean and add extras before checkout.</p>
        </div>
        <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Live total</div>
      </div>

      <div className="mt-5 space-y-4">
        <div className="space-y-1.5">
          <span className={cn("block", ROOM_FIELD_LABEL_CLASS)}>{entryCopy.suburbLabel}</span>
          <ServiceAreaPicker
            id="hero-widget-service-area"
            value={serviceAreaLocationId}
            emptyListMessage={entryCopy.emptyServiceAreaCoverage}
            onChange={(next) => {
              setServiceAreaLocationId(next.locationId);
              setServiceAreaCityId(next.cityId);
              setServiceAreaName(next.name);
            }}
            placeholder={entryCopy.suburbPlaceholder}
            loadingLabel="Loading suburbs…"
            className={cn(fieldClass, "mt-0")}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="hero-widget-street" className={ROOM_FIELD_LABEL_CLASS}>
            {entryCopy.streetLabel}
          </label>
          <input
            id="hero-widget-street"
            type="text"
            autoComplete="street-address"
            placeholder={entryCopy.streetPlaceholder}
            value={street}
            onChange={(e) => setStreet(e.target.value.slice(0, 500))}
            className={ROOM_TEXT_INPUT_CLASS}
          />
        </div>
        <p className="text-xs text-zinc-500">{entryCopy.suburbHelper}</p>
        <div>
          <label className="text-xs font-semibold uppercase tracking-wide text-blue-700" htmlFor="home-service">
            Service
          </label>
          <select
            id="home-service"
            className={cn(fieldClass, "mt-1.5")}
            value={service}
            disabled={availableServices.length === 0}
            onChange={(event) => setService(event.target.value as HomeWidgetServiceKey)}
          >
            {availableServices.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-blue-700" htmlFor="home-bedrooms">
              Bedrooms
            </label>
            <select
              id="home-bedrooms"
              className={cn(fieldClass, "mt-1.5")}
              value={bedrooms}
              onChange={(event) => setBedrooms(Number(event.target.value))}
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-blue-700" htmlFor="home-bathrooms">
              Bathrooms
            </label>
            <select
              id="home-bathrooms"
              className={cn(fieldClass, "mt-1.5")}
              value={bathrooms}
              onChange={(event) => setBathrooms(Number(event.target.value))}
            >
              {[1, 2, 3].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </div>
        </div>

        {pricingLoading && addOns.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-xs font-medium text-slate-500">
            Loading add-ons...
          </div>
        ) : (
          <AddOnsSelector addOns={addOns} selectedIds={selectedAddOns} onToggle={handleToggle} />
        )}

        <div className="rounded-2xl border border-blue-100 bg-blue-50/80 p-4">
          <div className="flex items-center justify-between text-sm text-zinc-600">
            <span>Cleaning service (base)</span>
            <span className="font-semibold text-zinc-900">{formatZar(basePrice)}</span>
          </div>
          <div className="mt-2 flex items-center justify-between text-sm text-zinc-600">
            <span>Add-ons</span>
            <span className="font-semibold text-zinc-900">{formatZar(extrasTotal)}</span>
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-blue-100 pt-3">
            <span className="text-sm font-semibold text-blue-700">Estimated total</span>
            <span className="text-3xl font-bold tabular-nums text-blue-700">{formatZar(total)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-snug text-zinc-600">{bookingCopy.checkout.widgetEstimateNote}</p>
        </div>

        <Button type="button" size="xl" className="w-full" disabled={!canContinue} onClick={handleContinue}>
          Continue Booking
        </Button>
      </div>
    </div>
  );
}
