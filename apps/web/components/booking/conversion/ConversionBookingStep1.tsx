"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { calculateHomeWidgetQuoteZar, getWidgetOptionalExtraPrices, type WidgetOptionalExtraId } from "@/lib/pricing/calculatePrice";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";
import { Button } from "@/components/ui/button";
import { BookingDateTimeSection } from "@/components/booking/BookingDateTimeSection";
import { BookingOptionalExtrasSection } from "@/components/booking/BookingOptionalExtrasSection";
import { WidgetServicePicker } from "@/components/booking/WidgetServicePicker";
import { FloatingSelect } from "@/components/ui/floating-select";
import type { ConversionBookingFormState } from "@/components/booking/conversion/conversionBookingTypes";
import {
  BATHROOM_SELECT_OPTIONS,
  BEDROOM_SELECT_OPTIONS,
  EXTRA_ROOMS_SELECT_OPTIONS,
} from "@/lib/booking/extraRoomsSelectOptions";
import { todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import { cn } from "@/lib/utils";
import { ServiceAreaPicker } from "@/components/booking/ServiceAreaPicker";
import { bookingCopy } from "@/lib/booking/copy";

export type ConversionBookingStep1Props = {
  form: ConversionBookingFormState;
  setForm: React.Dispatch<React.SetStateAction<ConversionBookingFormState>>;
  onContinue: () => void;
  continueDisabled: boolean;
  locking: boolean;
  /** When true, date/time were set from the homepage widget — collect them on step 1 only if false. */
  hideScheduleFields?: boolean;
};

export function ConversionBookingStep1({
  form,
  setForm,
  onContinue,
  continueDisabled,
  locking,
  hideScheduleFields = false,
}: ConversionBookingStep1Props) {
  const [catalog, setCatalog] = useState<PricingRatesSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/pricing/catalog")
      .then((r) => r.json())
      .then((j: { snapshot?: PricingRatesSnapshot }) => {
        if (cancelled || !j?.snapshot) return;
        setCatalog(j.snapshot);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const onConvDateChange = useCallback(
    (ymd: string) => setForm((p) => ({ ...p, date: ymd })),
    [setForm],
  );
  const onConvTimeChange = useCallback(
    (hm: string) => setForm((p) => ({ ...p, time: hm })),
    [setForm],
  );

  function toggleExtra(id: string) {
    setForm((p) => ({
      ...p,
      extras: p.extras.includes(id) ? p.extras.filter((x) => x !== id) : [...p.extras, id],
    }));
  }

  const handleServiceChange = useCallback(
    (service: HomeWidgetServiceKey) => {
      setForm((p) => ({ ...p, service }));
    },
    [setForm],
  );

  const finalPrice = useMemo(() => {
    if (!catalog) return 0;
    return calculateHomeWidgetQuoteZar(
      {
        service: form.service,
        bedrooms: form.bedrooms,
        bathrooms: form.bathrooms,
        extraRooms: form.extraRooms,
        extras: form.extras,
      },
      catalog,
    );
  }, [form.service, form.bedrooms, form.bathrooms, form.extraRooms, form.extras, catalog]);

  const displayPrice = form.price != null ? form.price : finalPrice;

  const zeroWidget: Record<WidgetOptionalExtraId, number> = {
    fridge: 0,
    oven: 0,
    cabinets: 0,
    windows: 0,
    walls: 0,
    plants: 0,
  };
  const widgetPrices = catalog ? getWidgetOptionalExtraPrices(catalog) : zeroWidget;

  return (
    <section className="space-y-6" aria-labelledby="conversion-step1-heading">
      <div>
        <h1
          id="conversion-step1-heading"
          className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-3xl"
        >
          Finalize your clean
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {hideScheduleFields
            ? "Add rooms and optional extras. Your total is confirmed on the server when you continue."
            : "Pick your slot, then tune rooms and extras. Your total is confirmed on the server when you continue."}
        </p>
      </div>

      <WidgetServicePicker
        value={form.service}
        onChange={handleServiceChange}
        labelId="conversion-service-type-label"
        embedded
      />

      <div className="space-y-2">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">Service area (suburb)</span>
        <ServiceAreaPicker
          id="conversion-service-area"
          value={form.serviceAreaLocationId}
          emptyListMessage={bookingCopy.entry.emptyServiceAreaCoverage}
          onChange={(next) =>
            setForm((p) => ({
              ...p,
              serviceAreaLocationId: next.locationId,
              serviceAreaCityId: next.cityId,
              serviceAreaName: next.name,
            }))
          }
          placeholder="Choose your suburb"
          className="h-12 rounded-xl text-base"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FloatingSelect
          variant="room"
          label="Bedrooms"
          name="bedrooms"
          value={String(form.bedrooms)}
          onChange={(v) => setForm((p) => ({ ...p, bedrooms: Number(v) }))}
          options={BEDROOM_SELECT_OPTIONS}
        />
        <FloatingSelect
          variant="room"
          label="Bathrooms"
          name="bathrooms"
          value={String(form.bathrooms)}
          onChange={(v) => setForm((p) => ({ ...p, bathrooms: Number(v) }))}
          options={BATHROOM_SELECT_OPTIONS}
        />
        <div className="sm:col-span-2 lg:col-span-1">
          <FloatingSelect
            variant="room"
            label="Extra Rooms"
            name="extraRooms"
            value={String(form.extraRooms)}
            onChange={(v) => setForm((p) => ({ ...p, extraRooms: Number(v) }))}
            options={EXTRA_ROOMS_SELECT_OPTIONS}
            aria-label="Number of extra rooms"
          />
        </div>
      </div>

      {!hideScheduleFields ? (
        <BookingDateTimeSection
          key={form.date}
          date={form.date}
          time={form.time}
          onDateChange={onConvDateChange}
          onTimeChange={onConvTimeChange}
          minDateYmd={todayBookingYmd()}
          dateTriggerId="conv-date"
        />
      ) : null}

      <BookingOptionalExtrasSection
        selectedIds={form.extras}
        onToggle={toggleExtra}
        widgetPrices={widgetPrices}
        className="rounded-2xl border border-zinc-100 bg-zinc-50/50 p-4 dark:border-zinc-800 dark:bg-zinc-950/40"
      />

      <div className="rounded-xl border border-green-200 bg-green-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Your price</p>
        <p className="text-2xl font-bold tabular-nums text-green-700 dark:text-emerald-400">
          R{displayPrice.toLocaleString("en-ZA")}
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          {form.price != null
            ? "This price is locked before payment."
            : "We lock this exact total on the server when you continue — same engine as checkout."}
        </p>
      </div>

      <div className="hidden lg:block">
        <Button
          type="button"
          size="lg"
          disabled={continueDisabled || locking}
          onClick={onContinue}
          className={cn("h-14 w-full rounded-2xl text-base font-bold shadow-md")}
        >
          {locking ? "Locking your price…" : "Continue"}
        </Button>
      </div>
    </section>
  );
}
