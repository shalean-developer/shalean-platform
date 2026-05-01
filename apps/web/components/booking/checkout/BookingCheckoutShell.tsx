"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileBottomBar } from "@/components/booking/MobileBottomBar";
import { PriceSummaryCard } from "@/components/booking/PriceSummaryCard";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  BookingCheckoutHeader,
  bookingCheckoutHeaderStepFromSegment,
} from "@/components/booking/checkout/BookingCheckoutHeader";
import { BookingLayout } from "@/components/booking/checkout/BookingLayout";
import { StepHeader } from "@/components/booking/StepHeader";
import {
  getBlockedExtraIds,
  getBookingSummaryServiceLabel,
  inferServiceTypeFromServiceId,
  parseBookingServiceId,
} from "@/components/booking/serviceCategories";
import { formatCheckoutWhenLabel } from "@/components/booking/summary/formatCheckoutWhenLabel";
import type { PriceSummaryCardProps } from "@/components/booking/PriceSummaryCard";
import { checkoutSidebarPriceDisplay } from "@/lib/booking/checkoutSidebarPricing";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";
import { bookingEntryPatchFromSearchParams, withBookingQuery } from "@/lib/booking/bookingUrl";
import { reconcileCheckoutPersistedSlice, validateCheckoutStoreForPayment } from "@/lib/booking/reconcileBookingState";
import {
  BOOKING_CHECKOUT_SEGMENTS,
  BOOKING_SEGMENT_INDEX,
  checkoutSegmentPath,
  getMaxReachableCheckoutSegmentIndex,
  isBookingCheckoutSegment,
  nextCheckoutSegment,
  prevCheckoutSegment,
  scheduleStepComplete,
  type BookingCheckoutSegment,
} from "@/lib/booking/bookingCheckoutGuards";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";
import { cn } from "@/lib/utils";

const SEGMENT_TITLES: Record<BookingCheckoutSegment, string> = {
  details: "Your home & service",
  schedule: "When should we come?",
  cleaner: "Preferred cleaner",
  payment: "Review & pay",
};

const TOTAL = BOOKING_CHECKOUT_SEGMENTS.length;

export function BookingCheckoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: catalog, loading: catalogLoading } = usePricingCatalog();
  const snapshot = catalog?.snapshot ?? null;

  const service = useBookingCheckoutStore((s) => s.service);
  const bedrooms = useBookingCheckoutStore((s) => s.bedrooms);
  const bathrooms = useBookingCheckoutStore((s) => s.bathrooms);
  const extraRooms = useBookingCheckoutStore((s) => s.extraRooms);
  const extras = useBookingCheckoutStore((s) => s.extras);
  const date = useBookingCheckoutStore((s) => s.date);
  const time = useBookingCheckoutStore((s) => s.time);
  const location = useBookingCheckoutStore((s) => s.location);
  const detailsFlowPhase = useBookingCheckoutStore((s) => s.detailsFlowPhase);
  const serviceAreaName = useBookingCheckoutStore((s) => s.serviceAreaName);
  const cleanerId = useBookingCheckoutStore((s) => s.cleanerId);
  const customerName = useBookingCheckoutStore((s) => s.customerName);
  const customerEmail = useBookingCheckoutStore((s) => s.customerEmail);
  const customerPhone = useBookingCheckoutStore((s) => s.customerPhone);
  const patch = useBookingCheckoutStore((s) => s.patch);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const openSummarySheet = useCallback(() => setSummaryOpen(true), []);
  const hydratedFromUrlRef = useRef(false);

  const segment: BookingCheckoutSegment = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const key = parts[1];
    return isBookingCheckoutSegment(key) ? key : "details";
  }, [pathname]);

  const stepIndex = BOOKING_SEGMENT_INDEX[segment];

  useEffect(() => {
    const unsub = useBookingCheckoutStore.persist.onFinishHydration(() => {
      if (hydratedFromUrlRef.current) return;
      hydratedFromUrlRef.current = true;
      if (typeof window === "undefined") return;
      const entry = bookingEntryPatchFromSearchParams(new URLSearchParams(window.location.search));
      if (Object.keys(entry).length > 0) {
        const merged = reconcileCheckoutPersistedSlice({
          urlState: entry,
          storeState: useBookingCheckoutStore.getState(),
        });
        useBookingCheckoutStore.getState().patch(merged);
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (segment !== "payment") return;
    if (catalogLoading || !catalog?.services?.length) return;
    try {
      validateCheckoutStoreForPayment(useBookingCheckoutStore.getState());
      console.log("[BOOKING STATE VALIDATED]", { step: "payment", valid: true });
    } catch {
      router.replace(withBookingQuery(checkoutSegmentPath("details"), searchParams));
    }
  }, [segment, catalogLoading, catalog?.services?.length, router, searchParams]);

  useEffect(() => {
    if (!catalog?.services?.length) return;
    const ids = new Set(catalog.services.map((s) => s.id));
    const cur = useBookingCheckoutStore.getState();
    if (!cur.service || !ids.has(cur.service)) {
      patch({ service: catalog.services[0]!.id });
    }
  }, [catalog, patch]);

  useEffect(() => {
    if (!catalog?.extras?.length) return;
    const allowed = new Set(catalog.extras.map((e) => e.id));
    const sid = parseBookingServiceId(useBookingCheckoutStore.getState().service);
    const blocked = getBlockedExtraIds(sid);
    const cur = useBookingCheckoutStore.getState();
    const seen = new Set<string>();
    const next: string[] = [];
    for (const id of cur.extras) {
      if (!allowed.has(id) || blocked.has(id) || seen.has(id)) continue;
      seen.add(id);
      next.push(id);
    }
    if (next.length !== cur.extras.length) patch({ extras: next });
  }, [catalog, service, patch]);

  useEffect(() => {
    if (segment !== "schedule") return;
    const cur = useBookingCheckoutStore.getState();
    if (cur.date == null) patch({ date: todayBookingYmd() });
  }, [segment, patch]);

  const maxIdx = useMemo(
    () =>
      getMaxReachableCheckoutSegmentIndex(
        {
          service,
          bedrooms,
          bathrooms,
          date,
          time,
          location,
        },
        catalog?.services?.map((x) => x.id),
        { catalogLoading, currentSegmentIndex: stepIndex },
      ),
    [service, bedrooms, bathrooms, date, time, location, catalog?.services, catalogLoading, stepIndex],
  );

  useEffect(() => {
    if (stepIndex > maxIdx) {
      const target = BOOKING_CHECKOUT_SEGMENTS[maxIdx];
      if (target && checkoutSegmentPath(target) !== pathname) {
        router.replace(withBookingQuery(checkoutSegmentPath(target), searchParams));
      }
    }
  }, [stepIndex, maxIdx, pathname, router, searchParams]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [segment]);

  const sid = parseBookingServiceId(service);
  const serviceValid = useMemo(() => {
    if (!catalog?.services?.length) return false;
    const ids = new Set(catalog.services.map((s) => s.id));
    return Boolean(service && sid && ids.has(service));
  }, [catalog, service, sid]);

  const extrasRows = useMemo(() => {
    if (!extras.length) return [];
    if (!snapshot) {
      return extras.map((id) => ({
        id,
        label: id.replace(/-/g, " "),
        priceZar: undefined as number | undefined,
      }));
    }
    const lines = extrasLineItemsFromSnapshot(snapshot, extras, sid);
    const bySlug = new Map(lines.map((l) => [l.slug, l] as const));
    return extras.map((id) => {
      const row = bySlug.get(id);
      return {
        id,
        label: row?.name ?? id.replace(/-/g, " "),
        priceZar: row?.price,
      };
    });
  }, [extras, snapshot, sid]);

  const sidebarPricing = useMemo(
    () =>
      checkoutSidebarPriceDisplay({
        snapshot,
        segment,
        service: sid,
        bedrooms,
        bathrooms,
        extraRooms,
        extras,
        time,
      }),
    [snapshot, segment, sid, bedrooms, bathrooms, extraRooms, extras, time],
  );

  const whereLabel = useMemo(
    () => serviceAreaName?.trim() || location?.trim() || "Not set yet",
    [serviceAreaName, location],
  );

  const whatLabel = useMemo(
    () => getBookingSummaryServiceLabel(sid, inferServiceTypeFromServiceId(sid)),
    [sid],
  );

  const whenLabel = useMemo(() => formatCheckoutWhenLabel(date, time), [date, time]);

  const pricingLoading = catalogLoading || !snapshot;

  const detailsHome = detailsFlowPhase === "home-details";
  const propertyValid = bedrooms >= 1 && bathrooms >= 1;

  const scheduleComplete = useMemo(
    () => scheduleStepComplete({ date, time, location }),
    [date, time, location],
  );

  const continueDisabled = useMemo(() => {
    if (segment === "details") return !serviceValid || !detailsHome || !propertyValid;
    if (segment === "schedule") return !scheduleComplete;
    return false;
  }, [segment, serviceValid, detailsHome, propertyValid, scheduleComplete]);

  const nextSeg = nextCheckoutSegment(segment);
  const prevSeg = prevCheckoutSegment(segment);

  const goNext = useCallback(() => {
    if (continueDisabled || !nextSeg) return;
    router.push(withBookingQuery(checkoutSegmentPath(nextSeg), searchParams));
  }, [continueDisabled, nextSeg, router, searchParams]);

  const goBack = useCallback(() => {
    if (!prevSeg) return;
    router.push(withBookingQuery(checkoutSegmentPath(prevSeg), searchParams));
  }, [prevSeg, router, searchParams]);

  const onRemoveExtra = useCallback(
    (id: string) => {
      patch({ extras: extras.filter((x) => x !== id) });
    },
    [patch, extras],
  );

  const showStepNav = segment !== "payment";

  const sharedSummaryProps = useMemo((): Omit<PriceSummaryCardProps, "layoutMode" | "onMobileDockOpen"> => {
    return {
      whereLabel,
      whatLabel,
      whenLabel,
      editWhereHref: withBookingQuery(checkoutSegmentPath("details"), searchParams),
      editWhatHref: withBookingQuery(checkoutSegmentPath("details"), searchParams),
      editWhenHref: withBookingQuery(checkoutSegmentPath("schedule"), searchParams),
      checkoutStep: sidebarPricing.step,
      summaryHours: sidebarPricing.hours,
      summaryTotalZar: sidebarPricing.totalZar,
      extrasRows,
      onRemoveExtra,
      loading: pricingLoading,
      bedrooms,
      bathrooms,
      extraRooms,
      bookingDate: date,
      bookingTime: time,
      cleanerId,
      customerName,
      customerEmail,
      customerPhone,
    };
  }, [
    whereLabel,
    whatLabel,
    whenLabel,
    searchParams,
    sidebarPricing.step,
    sidebarPricing.hours,
    sidebarPricing.totalZar,
    extrasRows,
    onRemoveExtra,
    pricingLoading,
    bedrooms,
    bathrooms,
    extraRooms,
    date,
    time,
    cleanerId,
    customerName,
    customerEmail,
    customerPhone,
  ]);

  const summaryCard = useMemo(() => <PriceSummaryCard {...sharedSummaryProps} />, [sharedSummaryProps]);

  const hideContinueOnDetailsPick = segment === "details" && !detailsHome;

  const desktopFooter =
    showStepNav && (prevSeg || nextSeg) ? (
      <div className="flex gap-4 border-t border-gray-100 pt-6 dark:border-zinc-800">
        <Button
          type="button"
          variant="outline"
          size="xl"
          className={cn(
            "rounded-xl border-gray-200 font-semibold transition-all duration-200 hover:bg-gray-50 dark:border-zinc-600 dark:hover:bg-zinc-800/80",
            hideContinueOnDetailsPick ? "w-full" : "flex-1",
          )}
          disabled={!prevSeg}
          onClick={goBack}
        >
          Back
        </Button>
        {nextSeg && !hideContinueOnDetailsPick ? (
          <Button
            type="button"
            size="xl"
            className="flex-1 rounded-xl font-semibold shadow-sm transition-all duration-200"
            disabled={continueDisabled}
            onClick={goNext}
          >
            Continue
          </Button>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <BookingCheckoutHeader currentStep={bookingCheckoutHeaderStepFromSegment(segment)} />
      <BookingLayout
        stepCurrent={stepIndex + 1}
        stepTotal={TOTAL}
        showTopProgress={false}
        summary={summaryCard}
        desktopFooter={desktopFooter}
        main={
          <AnimatePresence mode="wait">
            <motion.div
              key={segment}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn("space-y-4 lg:space-y-8", showStepNav ? "pb-28 lg:pb-0" : "pb-6 lg:pb-0")}
            >
              <StepHeader title={SEGMENT_TITLES[segment]} />
              {children}
            </motion.div>
          </AnimatePresence>
        }
      />

      {showStepNav ? (
        <>
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden">
            <MobileBottomBar
              variant="flat"
              omitCta
              checkoutDock={{
                onBack: goBack,
                backDisabled: !prevSeg,
                onContinue: goNext,
                continueDisabled: continueDisabled,
                hideContinue: hideContinueOnDetailsPick,
                continueLabel: "Continue",
              }}
              estimatedHoursLabel={formatBookingHoursCompact(sidebarPricing.hours)}
              totalDisplay={
                pricingLoading ? "…" : `R ${Math.round(sidebarPricing.totalZar).toLocaleString("en-ZA")}`
              }
              totalZar={sidebarPricing.totalZar}
              onAmountClick={openSummarySheet}
            />
          </div>
          <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
            <DialogContent
              hideClose
              className="fixed inset-x-0 bottom-0 left-0 top-auto max-h-[85vh] w-full max-w-none translate-x-0 translate-y-0 rounded-t-2xl border-gray-100 p-5 dark:border-zinc-800 sm:left-1/2 sm:max-w-lg sm:-translate-x-1/2"
            >
              <DialogHeader className="text-left">
                <DialogTitle className="text-base font-semibold">Your quote</DialogTitle>
              </DialogHeader>
              {summaryCard}
              <Button
                type="button"
                variant="outline"
                className="mt-4 h-12 w-full rounded-xl border-gray-200 font-semibold dark:border-zinc-600"
                onClick={() => setSummaryOpen(false)}
              >
                Close
              </Button>
            </DialogContent>
          </Dialog>
        </>
      ) : null}
    </>
  );
}
