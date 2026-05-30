"use client";

import { ChevronDown, Lock } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AddOnsSection } from "@/components/booking/checkout/AddOnsSection";
import { DetailsPriceAnchor } from "@/components/booking/DetailsPriceAnchor";
import { HomeDetailsStep } from "@/components/booking/steps/HomeDetailsStep";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { bookingCopy } from "@/lib/booking/copy";
import { checkoutSidebarPriceDisplay } from "@/lib/booking/checkoutSidebarPricing";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";
import { parseBookingServiceId } from "@/components/booking/serviceCategories";

const copy = bookingCopy.details;

export function BookingDetailsPage() {
  const { data: catalog, loading } = usePricingCatalog();
  const snapshot = catalog?.snapshot ?? null;

  const service = useBookingCheckoutStore((s) => s.service);
  const detailsFlowPhase = useBookingCheckoutStore((s) => s.detailsFlowPhase);
  const bedrooms = useBookingCheckoutStore((s) => s.bedrooms);
  const bathrooms = useBookingCheckoutStore((s) => s.bathrooms);
  const extraRooms = useBookingCheckoutStore((s) => s.extraRooms);
  const extras = useBookingCheckoutStore((s) => s.extras);
  const patch = useBookingCheckoutStore((s) => s.patch);

  const [extrasPanelOpen, setExtrasPanelOpen] = useState(false);

  /** Catalog `loading` / options differ SSR vs first client paint — render controls only after mount. */
  const [clientMounted, setClientMounted] = useState(false);
  useEffect(() => {
    setClientMounted(true);
  }, []);

  useEffect(() => {
    if (extras.length > 0) setExtrasPanelOpen(true);
  }, [extras.length]);

  /** Path-based checkout previously opened the grid phase first — converge to blueprint single screen. */
  useEffect(() => {
    if (detailsFlowPhase === "pick-service") {
      patch({ detailsFlowPhase: "home-details" });
    }
  }, [detailsFlowPhase, patch]);

  const sid = parseBookingServiceId(service);

  const sidebarPricing = useMemo(
    () =>
      checkoutSidebarPriceDisplay({
        snapshot,
        segment: "details",
        service: sid,
        bedrooms,
        bathrooms,
        extraRooms,
        extras,
        time: null,
      }),
    [snapshot, sid, bedrooms, bathrooms, extraRooms, extras],
  );

  const anchorHoursLine =
    sidebarPricing.hours > 0 ? formatBookingHoursCompact(sidebarPricing.hours) : "—";
  const anchorPriceLine =
    sidebarPricing.totalZar > 0
      ? `R ${Math.round(sidebarPricing.totalZar).toLocaleString("en-ZA")}`
      : "—";

  const onServiceSelect = (next: string) => {
    patch({ service: next, detailsFlowPhase: "home-details" });
  };

  const services = catalog?.services ?? [];
  const disableServiceControls = !clientMounted || loading || services.length === 0;

  return (
    <div className="space-y-4 pb-3 sm:space-y-5 lg:pb-2">
      <section className="overflow-hidden rounded-xl border border-zinc-200/85 bg-white shadow-sm shadow-zinc-900/[0.05] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-black/25">
        <div className="space-y-5 p-4 sm:space-y-6 sm:p-6">
          {/* Service */}
          <div className="space-y-2">
            <label
              htmlFor="checkout-details-service"
              className="text-sm font-semibold text-zinc-900 dark:text-zinc-50"
            >
              {copy.yourServiceLabel}
            </label>
            <div className="relative min-w-0 flex-1">
                {clientMounted ? (
                  <>
                    <select
                      id="checkout-details-service"
                      className="min-h-11 w-full appearance-none rounded-xl border border-zinc-200/90 bg-white py-2.5 pl-3 pr-10 text-sm font-medium text-zinc-900 shadow-sm outline-none transition hover:border-zinc-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:border-zinc-600 dark:focus:border-blue-400 dark:focus:ring-blue-400/25"
                      disabled={disableServiceControls}
                      value={service}
                      onChange={(e) => onServiceSelect(e.target.value)}
                    >
                      {services.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown
                      className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500 dark:text-zinc-400"
                      aria-hidden
                    />
                  </>
                ) : (
                  <div
                    className="min-h-11 w-full rounded-xl border border-zinc-200/90 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900"
                    aria-hidden
                  />
                )}
              </div>
          </div>

          {/* Property */}
          <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <p className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {copy.propertySectionLabel}
            </p>
            <div className="rounded-xl border border-zinc-100 bg-zinc-50/80 p-3 dark:border-zinc-800/80 dark:bg-zinc-900/35">
              {clientMounted ? (
                <HomeDetailsStep
                  value={{ bedrooms, bathrooms, extraRooms }}
                  onChange={(v) => patch(v)}
                />
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-hidden>
                  {[0, 1, 2].map((k) => (
                    <div
                      key={k}
                      className="h-12 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/80"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Extras — collapsed by default */}
          <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800">
            <details
              className="group rounded-xl border border-zinc-200/80 bg-white shadow-sm transition-shadow duration-200 open:shadow-md dark:border-zinc-700 dark:bg-zinc-950 dark:open:shadow-md"
              open={extrasPanelOpen}
              onToggle={(e) => setExtrasPanelOpen(e.currentTarget.open)}
            >
              <summary className="flex min-h-[52px] cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden sm:min-h-14 sm:px-4">
                <span className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                  <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">{copy.extrasTitle}</span>
                  <span className="text-[15px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                    {copy.showExtrasCollapsed}
                  </span>
                </span>
                <ChevronDown
                  className="h-5 w-5 shrink-0 text-zinc-500 transition duration-200 group-open:rotate-180 dark:text-zinc-400"
                  aria-hidden
                />
              </summary>
              <div className="border-t border-zinc-200/80 px-3 pb-4 pt-3 dark:border-zinc-700 sm:px-4 sm:pb-5 sm:pt-4">
                <AddOnsSection layout="embedded" />
              </div>
            </details>
          </div>

          {/* Price anchor — mobile only; desktop uses sticky sidebar */}
          <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800 lg:hidden">
            <DetailsPriceAnchor
              hoursLine={anchorHoursLine}
              priceLine={anchorPriceLine}
              footnote={copy.priceAnchorFootnote}
              hideFootnoteBelowLg
            />
          </div>

          <div className="border-t border-zinc-100 pt-5 dark:border-zinc-800 lg:hidden">
            <div className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200/90 bg-zinc-50 py-3 dark:border-zinc-700 dark:bg-zinc-900/60">
              <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span className="text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
                {copy.footerTrustCompact}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
