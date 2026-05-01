"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BottomCTA } from "@/components/booking/BottomCTA";
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
import { findLocationBySlug, normalizeLocationSlugParam } from "@/lib/booking/bookingFlowLocationCatalog";
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
import type { BookingCheckoutState } from "@/lib/booking/bookingCheckoutStore";
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

function serviceFromSearchParam(raw: string | null | undefined): string | undefined {
  if (raw == null) return undefined;
  const t = raw.trim().toLowerCase().replace(/_/g, "-");
  if (!t) return undefined;
  if (t === "deep" || t === "deep-cleaning" || t === "deep-clean" || t === "deep_cleaning") return "deep";
  if (t === "standard" || t === "standard-cleaning" || t === "standard_cleaning") return "standard";
  if (t === "move" || t === "move-out" || t === "move-out-cleaning" || t === "move_out_cleaning" || t === "move-cleaning")
    return "move";
  const parsed = parseBookingServiceId(t);
  return parsed ?? undefined;
}

function locationPatchFromSearchParam(
  raw: string | null | undefined,
): Partial<
  Pick<
    BookingCheckoutState,
    "location" | "locationSlug" | "serviceAreaLocationId" | "serviceAreaCityId" | "serviceAreaName"
  >
> | undefined {
  if (raw == null) return undefined;
  const s = raw.trim();
  if (!s) return undefined;
  const hit = findLocationBySlug(normalizeLocationSlugParam(s.replace(/\+/g, "-")));
  if (hit) {
    return {
      locationSlug: hit.slug,
      serviceAreaName: hit.name,
      serviceAreaLocationId: null,
      serviceAreaCityId: null,
    };
  }
  return { location: s };
}

export function BookingCheckoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: catalog, loading: catalogLoading } = usePricingCatalog();
  const snapshot = catalog?.snapshot ?? null;

  const state = useBookingCheckoutStore();
  const patch = useBookingCheckoutStore((s) => s.patch);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const openSummarySheet = useCallback(() => setSummaryOpen(true), []);

  const segment: BookingCheckoutSegment = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const key = parts[1];
    return isBookingCheckoutSegment(key) ? key : "details";
  }, [pathname]);

  const stepIndex = BOOKING_SEGMENT_INDEX[segment];

  useEffect(() => {
    const locPatch = locationPatchFromSearchParam(searchParams.get("location"));
    const svc = serviceFromSearchParam(searchParams.get("service"));
    if (locPatch !== undefined || svc !== undefined) {
      patch({
        ...(locPatch !== undefined ? locPatch : {}),
        ...(svc !== undefined ? { service: svc } : {}),
      });
    }
  }, [searchParams, patch]);

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
  }, [catalog, state.service, patch]);

  useEffect(() => {
    if (segment !== "schedule") return;
    const cur = useBookingCheckoutStore.getState();
    if (cur.date == null) patch({ date: todayBookingYmd() });
  }, [segment, patch]);

  const maxIdx = useMemo(
    () =>
      getMaxReachableCheckoutSegmentIndex(
        {
          service: state.service,
          bedrooms: state.bedrooms,
          bathrooms: state.bathrooms,
          date: state.date,
          time: state.time,
          location: state.location,
        },
        catalog?.services?.map((x) => x.id),
      ),
    [state.service, state.bedrooms, state.bathrooms, state.date, state.time, state.location, catalog?.services],
  );

  useEffect(() => {
    if (stepIndex > maxIdx) {
      const target = BOOKING_CHECKOUT_SEGMENTS[maxIdx];
      if (target && checkoutSegmentPath(target) !== pathname) {
        router.replace(checkoutSegmentPath(target));
      }
    }
  }, [stepIndex, maxIdx, pathname, router]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [segment]);

  const sid = parseBookingServiceId(state.service);
  const serviceValid = useMemo(() => {
    if (!catalog?.services?.length) return false;
    const ids = new Set(catalog.services.map((s) => s.id));
    return Boolean(state.service && sid && ids.has(state.service));
  }, [catalog, state.service, sid]);

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

  const sidebarPricing = useMemo(
    () =>
      checkoutSidebarPriceDisplay({
        snapshot,
        segment,
        service: sid,
        bedrooms: state.bedrooms,
        bathrooms: state.bathrooms,
        extraRooms: state.extraRooms,
        extras: state.extras,
        time: state.time,
      }),
    [snapshot, segment, sid, state.bedrooms, state.bathrooms, state.extraRooms, state.extras, state.time],
  );

  const whereLabel = useMemo(
    () => state.serviceAreaName?.trim() || state.location?.trim() || "Not set yet",
    [state.serviceAreaName, state.location],
  );

  const whatLabel = useMemo(
    () => getBookingSummaryServiceLabel(sid, inferServiceTypeFromServiceId(sid)),
    [sid],
  );

  const whenLabel = useMemo(() => formatCheckoutWhenLabel(state.date, state.time), [state.date, state.time]);

  const pricingLoading = catalogLoading || !snapshot;

  const detailsHome = state.detailsFlowPhase === "home-details";
  const propertyValid = state.bedrooms >= 1 && state.bathrooms >= 1;

  const continueDisabled = useMemo(() => {
    if (segment === "details") return !serviceValid || !detailsHome || !propertyValid;
    if (segment === "schedule") return !scheduleStepComplete(state);
    return false;
  }, [segment, serviceValid, detailsHome, propertyValid, state]);

  const nextSeg = nextCheckoutSegment(segment);
  const prevSeg = prevCheckoutSegment(segment);

  const goNext = useCallback(() => {
    if (continueDisabled || !nextSeg) return;
    router.push(checkoutSegmentPath(nextSeg));
  }, [continueDisabled, nextSeg, router]);

  const goBack = useCallback(() => {
    if (!prevSeg) return;
    router.push(checkoutSegmentPath(prevSeg));
  }, [prevSeg, router]);

  const onRemoveExtra = useCallback(
    (id: string) => {
      patch({ extras: state.extras.filter((x) => x !== id) });
    },
    [patch, state.extras],
  );

  const showStepNav = segment !== "payment";

  const sharedSummaryProps = useMemo((): Omit<PriceSummaryCardProps, "layoutMode" | "onMobileDockOpen"> => {
    return {
      whereLabel,
      whatLabel,
      whenLabel,
      editWhereHref: checkoutSegmentPath("details"),
      editWhatHref: checkoutSegmentPath("details"),
      editWhenHref: checkoutSegmentPath("schedule"),
      checkoutStep: sidebarPricing.step,
      summaryHours: sidebarPricing.hours,
      summaryTotalZar: sidebarPricing.totalZar,
      extrasRows,
      onRemoveExtra,
      loading: pricingLoading,
      bedrooms: state.bedrooms,
      bathrooms: state.bathrooms,
      extraRooms: state.extraRooms,
      bookingDate: state.date,
      bookingTime: state.time,
      cleanerId: state.cleanerId,
      customerName: state.customerName,
      customerEmail: state.customerEmail,
      customerPhone: state.customerPhone,
    };
  }, [
    whereLabel,
    whatLabel,
    whenLabel,
    sidebarPricing.step,
    sidebarPricing.hours,
    sidebarPricing.totalZar,
    extrasRows,
    onRemoveExtra,
    pricingLoading,
    state.bedrooms,
    state.bathrooms,
    state.extraRooms,
    state.date,
    state.time,
    state.cleanerId,
    state.customerName,
    state.customerEmail,
    state.customerPhone,
  ]);

  const summaryCard = useMemo(() => <PriceSummaryCard {...sharedSummaryProps} />, [sharedSummaryProps]);

  const summaryMobileDock = useMemo(
    () => (
      <PriceSummaryCard
        {...sharedSummaryProps}
        layoutMode="mobile-dock-compact"
        onMobileDockOpen={openSummarySheet}
      />
    ),
    [sharedSummaryProps, openSummarySheet],
  );

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
        trustFooterClearMobileDock={showStepNav}
        main={
          <AnimatePresence mode="wait">
            <motion.div
              key={segment}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn("space-y-6 lg:space-y-8", showStepNav ? "pb-[13.5rem] lg:pb-0" : "pb-6 lg:pb-0")}
            >
              <StepHeader title={SEGMENT_TITLES[segment]} />
              {children}
            </motion.div>
          </AnimatePresence>
        }
      />

      {showStepNav ? (
        <>
          <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
            <div className="border-t border-gray-200 bg-white/95 px-4 pb-1 pt-2 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.08)] backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
              {summaryMobileDock}
            </div>
            <BottomCTA
              embedded
              onBack={goBack}
              onNext={goNext}
              backDisabled={!prevSeg}
              nextDisabled={continueDisabled}
              hideNext={hideContinueOnDetailsPick}
              nextLabel="Continue"
              total={sidebarPricing.totalZar}
              priceLoading={pricingLoading}
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
