"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { PriceSummaryCard } from "@/components/booking/PriceSummaryCard";
import { CustomerDetailsStep } from "@/components/booking/steps/CustomerDetailsStep";
import { Button } from "@/components/ui/button";
import {
  getBookingSummaryServiceLabel,
  inferServiceTypeFromServiceId,
  parseBookingServiceId,
} from "@/components/booking/serviceCategories";
import { formatCheckoutWhenLabel } from "@/components/booking/summary/formatCheckoutWhenLabel";
import { checkoutSegmentPath } from "@/lib/booking/bookingCheckoutGuards";
import { checkoutSidebarPriceDisplay } from "@/lib/booking/checkoutSidebarPricing";
import { validateCustomerDetails } from "@/lib/booking/customerDetailsValidation";
import { submitBooking } from "@/lib/booking/submitBooking";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";

export function BookingPaymentPage() {
  const router = useRouter();
  const { data: catalog, loading: catalogLoading } = usePricingCatalog();
  const snapshot = catalog?.snapshot ?? null;
  const state = useBookingCheckoutStore();
  const patch = useBookingCheckoutStore((s) => s.patch);

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sid = parseBookingServiceId(state.service);
  const pricingLoading = catalogLoading || !snapshot;

  const sidebarPricing = useMemo(
    () =>
      checkoutSidebarPriceDisplay({
        snapshot,
        segment: "payment",
        service: sid,
        bedrooms: state.bedrooms,
        bathrooms: state.bathrooms,
        extraRooms: state.extraRooms,
        extras: state.extras,
        time: state.time,
      }),
    [snapshot, sid, state.bedrooms, state.bathrooms, state.extraRooms, state.extras, state.time],
  );

  const extrasRows = useMemo(() => {
    if (!state.extras.length) return [];
    if (!snapshot) {
      return state.extras.map((id) => ({
        id,
        label: id.replace(/-/g, " "),
        priceZar: undefined as number | undefined,
      }));
    }
    const lines = extrasLineItemsFromSnapshot(snapshot, state.extras, sid);
    const bySlug = new Map(lines.map((l) => [l.slug, l] as const));
    return state.extras.map((id) => {
      const row = bySlug.get(id);
      return {
        id,
        label: row?.name ?? id.replace(/-/g, " "),
        priceZar: row?.price,
      };
    });
  }, [state.extras, snapshot, sid]);

  const whereLabel = useMemo(
    () => state.serviceAreaName?.trim() || state.location?.trim() || "Not set yet",
    [state.serviceAreaName, state.location],
  );

  const whatLabel = useMemo(
    () => getBookingSummaryServiceLabel(sid, inferServiceTypeFromServiceId(sid)),
    [sid],
  );

  const whenLabel = useMemo(() => formatCheckoutWhenLabel(state.date, state.time), [state.date, state.time]);

  const onRemoveExtra = useCallback(
    (id: string) => {
      patch({ extras: state.extras.filter((x) => x !== id) });
    },
    [patch, state.extras],
  );

  const pay = useCallback(async () => {
    setError(null);
    const v = validateCustomerDetails({
      customerName: state.customerName,
      customerEmail: state.customerEmail,
      customerPhone: state.customerPhone,
    });
    if (!v.ok) {
      setError(v.error);
      return;
    }
    setBusy(true);
    const r = await submitBooking({
      service: state.service,
      bedrooms: state.bedrooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      extras: state.extras,
      date: state.date,
      time: state.time,
      location: state.location,
      locationSlug: state.locationSlug,
      serviceAreaLocationId: state.serviceAreaLocationId,
      serviceAreaCityId: state.serviceAreaCityId,
      serviceAreaName: state.serviceAreaName,
      cleanerId: state.cleanerId,
      customerName: state.customerName,
      customerEmail: state.customerEmail,
      customerPhone: state.customerPhone,
    });
    setBusy(false);
    if (r.success) {
      router.push(`/payment/${r.bookingId}`);
      return;
    }
    setError(r.error);
  }, [state, router]);

  const serviceLabel = getBookingSummaryServiceLabel(sid, inferServiceTypeFromServiceId(sid));

  return (
    <div className="space-y-6 lg:space-y-8">
      <BookingSectionCard eyebrow="Visit summary">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">{serviceLabel}</p>
        <p className="mt-2 text-xs text-gray-500 dark:text-zinc-400">
          {state.bedrooms} bed · {state.bathrooms} bath
          {state.extraRooms ? ` · ${state.extraRooms} extra` : ""}
        </p>
        {state.date && state.time ? (
          <p className="mt-1 text-xs text-gray-500 dark:text-zinc-400">
            {state.date} at {state.time}
          </p>
        ) : null}
      </BookingSectionCard>

      <BookingSectionCard eyebrow="Your details">
        <CustomerDetailsStep
          customerName={state.customerName}
          customerEmail={state.customerEmail}
          customerPhone={state.customerPhone}
          onChange={(p) => patch(p)}
        />
      </BookingSectionCard>

      <div className="space-y-3 lg:hidden">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Quote</p>
        <PriceSummaryCard
          whereLabel={whereLabel}
          whatLabel={whatLabel}
          whenLabel={whenLabel}
          editWhereHref={checkoutSegmentPath("details")}
          editWhatHref={checkoutSegmentPath("details")}
          editWhenHref={checkoutSegmentPath("schedule")}
          checkoutStep={sidebarPricing.step}
          summaryHours={sidebarPricing.hours}
          summaryTotalZar={sidebarPricing.totalZar}
          extrasRows={extrasRows}
          onRemoveExtra={onRemoveExtra}
          loading={pricingLoading}
          bedrooms={state.bedrooms}
          bathrooms={state.bathrooms}
          extraRooms={state.extraRooms}
          bookingDate={state.date}
          bookingTime={state.time}
          cleanerId={state.cleanerId}
          customerName={state.customerName}
          customerEmail={state.customerEmail}
          customerPhone={state.customerPhone}
        />
      </div>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      <div className="hidden border-t border-gray-100 pt-6 dark:border-zinc-800 lg:block">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Total due</p>
            <p className="mt-1 text-3xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {pricingLoading ? "…" : `R${Math.round(sidebarPricing.totalZar).toLocaleString("en-ZA")}`}
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="xl"
          className="mt-6 w-full rounded-xl font-semibold shadow-sm transition-all duration-200"
          disabled={busy || pricingLoading}
          onClick={() => void pay()}
        >
          {busy ? "Creating booking…" : "Pay & confirm"}
        </Button>
        <p className="mt-3 text-center text-xs text-gray-500 dark:text-zinc-400">Secure checkout on the next screen.</p>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-100 bg-white/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Total</p>
            <p className="text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
              {pricingLoading ? "…" : `R${Math.round(sidebarPricing.totalZar).toLocaleString("en-ZA")}`}
            </p>
          </div>
          <Button
            type="button"
            size="xl"
            className="shrink-0 rounded-xl px-6 font-semibold shadow-sm transition-all duration-200"
            disabled={busy || pricingLoading}
            onClick={() => void pay()}
          >
            {busy ? "…" : "Pay & confirm"}
          </Button>
        </div>
      </div>

      <div className="h-28 lg:hidden" aria-hidden />
    </div>
  );
}
