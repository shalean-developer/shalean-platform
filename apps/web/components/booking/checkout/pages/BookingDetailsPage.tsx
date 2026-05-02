"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AddOnsSection } from "@/components/booking/checkout/AddOnsSection";
import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { SERVICE_GRID_ITEMS } from "@/components/booking/ServiceGrid";
import { HomeDetailsStep } from "@/components/booking/steps/HomeDetailsStep";
import { ServiceStep } from "@/components/booking/steps/ServiceStep";
import { Button } from "@/components/ui/button";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";

export function BookingDetailsPage() {
  const propertyRef = useRef<HTMLDivElement>(null);
  const pickRef = useRef<HTMLDivElement>(null);

  const { data: catalog, loading } = usePricingCatalog();
  const service = useBookingCheckoutStore((s) => s.service);
  const detailsFlowPhase = useBookingCheckoutStore((s) => s.detailsFlowPhase);
  const bedrooms = useBookingCheckoutStore((s) => s.bedrooms);
  const bathrooms = useBookingCheckoutStore((s) => s.bathrooms);
  const extraRooms = useBookingCheckoutStore((s) => s.extraRooms);
  const patch = useBookingCheckoutStore((s) => s.patch);

  const isPick = detailsFlowPhase === "pick-service";

  const handleServiceChange = useCallback(
    (next: string) => {
      patch({ service: next, detailsFlowPhase: "home-details" });
      requestAnimationFrame(() => {
        propertyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    },
    [patch],
  );

  useEffect(() => {
    if (!isPick) return;
    pickRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [isPick]);

  const selectedLabel = useMemo(() => {
    const fromGrid = SERVICE_GRID_ITEMS.find((x) => x.id === service)?.name;
    if (fromGrid) return fromGrid;
    return catalog?.services?.find((s) => s.id === service)?.name ?? service.replace(/-/g, " ");
  }, [service, catalog]);

  return (
    <div className="space-y-8">
      <AnimatePresence mode="wait">
        {isPick ? (
          <motion.div
            key="service-pick"
            ref={pickRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="transition-all duration-300 ease-in-out"
          >
            <BookingSectionCard eyebrow="Service">
              <ServiceStep
                value={service}
                onChange={handleServiceChange}
                services={catalog?.services ?? []}
                loading={loading}
              />
            </BookingSectionCard>
          </motion.div>
        ) : (
          <motion.div
            key="home-details"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="space-y-6 transition-all duration-300 ease-in-out sm:space-y-8"
          >
            <div className="flex w-full flex-col items-center justify-center gap-3 rounded-2xl border border-transparent bg-transparent px-4 py-4 text-center shadow-none sm:border-gray-100 sm:bg-white sm:px-5 sm:shadow-sm dark:border-transparent dark:bg-transparent sm:dark:border-zinc-800 sm:dark:bg-zinc-900">
              <p className="text-sm text-gray-700 dark:text-zinc-200">
                <span className="font-medium text-gray-500 dark:text-zinc-400">Selected service:</span>{" "}
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">{selectedLabel}</span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 rounded-lg border-gray-200 font-semibold dark:border-zinc-600"
                onClick={() => patch({ detailsFlowPhase: "pick-service" })}
              >
                Change service
              </Button>
            </div>

            <div ref={propertyRef} id="booking-property-section" className="scroll-mt-28 space-y-8">
              <BookingSectionCard eyebrow="Property" className="!px-0 sm:!px-5 md:!px-6">
                <HomeDetailsStep value={{ bedrooms, bathrooms, extraRooms }} onChange={(v) => patch(v)} />
              </BookingSectionCard>
              <AddOnsSection />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
