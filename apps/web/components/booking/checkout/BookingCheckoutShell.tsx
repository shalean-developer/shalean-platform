"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MobileBottomBar } from "@/components/booking/MobileBottomBar";
import { PriceSummaryCard } from "@/components/booking/PriceSummaryCard";
import { Button } from "@/components/ui/button";
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
import { isBookingPaymentUuid } from "@/lib/booking/bookingPaymentUuid";
import { bookingEntryPatchFromSearchParams, buildPostIntakePaymentUrl, withBookingQuery } from "@/lib/booking/bookingUrl";
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
import { validateCustomerDetails } from "@/lib/booking/customerDetailsValidation";
import { useBookingCheckoutStore } from "@/lib/booking/bookingCheckoutStore";
import { submitBooking } from "@/lib/booking/submitBooking";
import { todayBookingYmd } from "@/lib/booking/bookingTimeSlots";
import { extrasLineItemsFromSnapshot } from "@/lib/pricing/extrasConfig";
import { usePricingCatalog } from "@/lib/pricing/usePricingCatalog";
import { cn } from "@/lib/utils";
import { bookingCopy } from "@/lib/booking/copy";

const detailsStepCopy = bookingCopy.details;
const detailsContinueLabel = detailsStepCopy.cta;
const scheduleCheckoutCopy = bookingCopy.checkoutSchedule;
const checkoutCleanerCopy = bookingCopy.checkoutCleaner;
const checkoutPaymentCopy = bookingCopy.checkoutPayment;

const SEGMENT_TITLES: Record<BookingCheckoutSegment, string> = {
  details: "Your home & service",
  schedule: "When should we come?",
  cleaner: checkoutCleanerCopy.title,
  payment: checkoutPaymentCopy.title,
};

const TOTAL = BOOKING_CHECKOUT_SEGMENTS.length;

export function BookingCheckoutShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cleanerContinueBusy, setCleanerContinueBusy] = useState(false);
  const [cleanerContinueError, setCleanerContinueError] = useState<string | null>(null);
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

  const hydratedFromUrlRef = useRef(false);

  const segment: BookingCheckoutSegment = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const key = parts[1];
    return isBookingCheckoutSegment(key) ? key : "details";
  }, [pathname]);

  const stepIndex = BOOKING_SEGMENT_INDEX[segment];

  const skipFunnelPaymentGuards = useMemo(
    () => segment === "payment" && isBookingPaymentUuid(searchParams.get("bookingId")?.trim() ?? ""),
    [segment, searchParams],
  );

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
    if (skipFunnelPaymentGuards) return;
    if (catalogLoading || !catalog?.services?.length) return;
    try {
      validateCheckoutStoreForPayment(useBookingCheckoutStore.getState());
      console.log("[BOOKING STATE VALIDATED]", { step: "payment", valid: true });
    } catch {
      router.replace(withBookingQuery(checkoutSegmentPath("details"), searchParams));
    }
  }, [segment, skipFunnelPaymentGuards, catalogLoading, catalog?.services?.length, router, searchParams]);

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
    if (skipFunnelPaymentGuards) return;
    if (stepIndex > maxIdx) {
      const target = BOOKING_CHECKOUT_SEGMENTS[maxIdx];
      if (target && checkoutSegmentPath(target) !== pathname) {
        router.replace(withBookingQuery(checkoutSegmentPath(target), searchParams));
      }
    }
  }, [skipFunnelPaymentGuards, stepIndex, maxIdx, pathname, router, searchParams]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [segment]);

  useEffect(() => {
    if (segment !== "cleaner") {
      setCleanerContinueError(null);
      setCleanerContinueBusy(false);
    }
  }, [segment]);

  const customerOk = useMemo(() => {
    const v = validateCustomerDetails({ customerName, customerEmail, customerPhone });
    return v.ok;
  }, [customerName, customerEmail, customerPhone]);

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
    if (segment === "cleaner") return !customerOk;
    return false;
  }, [segment, serviceValid, detailsHome, propertyValid, scheduleComplete, customerOk]);

  const nextSeg = nextCheckoutSegment(segment);
  const prevSeg = prevCheckoutSegment(segment);

  const goNext = useCallback(() => {
    if (continueDisabled || cleanerContinueBusy || !nextSeg) return;

    if (segment !== "cleaner") {
      router.push(withBookingQuery(checkoutSegmentPath(nextSeg), searchParams));
      return;
    }

    const s = useBookingCheckoutStore.getState();
    try {
      validateCheckoutStoreForPayment(s);
    } catch {
      setCleanerContinueError("Complete schedule and address first.");
      router.push(withBookingQuery(checkoutSegmentPath("details"), searchParams));
      return;
    }

    const cv = validateCustomerDetails({
      customerName: s.customerName,
      customerEmail: s.customerEmail,
      customerPhone: s.customerPhone,
    });
    if (!cv.ok) {
      setCleanerContinueError(cv.error);
      return;
    }

    setCleanerContinueError(null);
    setCleanerContinueBusy(true);
    void (async () => {
      const r = await submitBooking({
        service: s.service,
        bedrooms: s.bedrooms,
        bathrooms: s.bathrooms,
        extraRooms: s.extraRooms,
        extras: s.extras,
        date: s.date,
        time: s.time,
        location: s.location,
        locationSlug: s.locationSlug,
        serviceAreaLocationId: s.serviceAreaLocationId,
        serviceAreaCityId: s.serviceAreaCityId,
        serviceAreaName: s.serviceAreaName,
        cleanerId: s.cleanerId,
        cleanerDisplayName: s.cleanerDisplayName,
        customerName: s.customerName,
        customerEmail: s.customerEmail,
        customerPhone: s.customerPhone,
      });
      setCleanerContinueBusy(false);
      if (r.success) {
        router.push(buildPostIntakePaymentUrl(new URLSearchParams(searchParams.toString()), r.bookingId));
        return;
      }
      setCleanerContinueError(r.error);
    })();
  }, [segment, continueDisabled, cleanerContinueBusy, nextSeg, router, searchParams]);

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
    const sidebarTrustLine =
      segment === "schedule" || segment === "cleaner" ? scheduleCheckoutCopy.summaryTrust : undefined;
    const highlightWhenRow = segment === "schedule" || segment === "cleaner";
    const scheduleDesktopSidebar = segment === "schedule" || segment === "cleaner";
    const paymentDesktopSidebar = segment === "payment";
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
      highlightWhenRow,
      sidebarTrustLine,
      scheduleDesktopSidebar,
      paymentDesktopSidebar,
    };
  }, [
    segment,
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

  const isScheduleOrCleaner = segment === "schedule" || segment === "cleaner";

  const continueCtaLabel =
    segment === "schedule"
      ? scheduleCheckoutCopy.continueToCleaner
      : segment === "cleaner"
        ? cleanerContinueBusy
          ? checkoutPaymentCopy.creating
          : scheduleCheckoutCopy.continueToPayment
        : segment === "details"
          ? detailsContinueLabel
          : "Continue";

  const desktopFooter =
    showStepNav && (prevSeg || nextSeg) ? (
      <div
        className={cn("hidden flex-row gap-4 border-t border-gray-100 pt-6 dark:border-zinc-800 lg:flex")}
      >
        {isScheduleOrCleaner ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="xl"
              className="h-12 flex-1 rounded-xl border-gray-200 font-semibold text-zinc-700 transition-all duration-200 hover:bg-gray-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800/80"
              disabled={!prevSeg}
              onClick={goBack}
            >
              Back
            </Button>
            {nextSeg && !hideContinueOnDetailsPick ? (
              <Button
                type="button"
                size="xl"
                className="h-12 min-w-0 flex-1 rounded-xl font-semibold shadow-md shadow-blue-600/20 transition-all duration-200 hover:bg-blue-600/95 hover:shadow-lg hover:shadow-blue-600/25 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100 dark:hover:bg-blue-500/95"
                disabled={continueDisabled || (segment === "cleaner" && cleanerContinueBusy)}
                onClick={() => void goNext()}
              >
                {continueCtaLabel}
              </Button>
            ) : null}
          </>
        ) : (
          <>
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
                className="flex-1 rounded-xl font-semibold shadow-sm transition-all duration-200 disabled:opacity-60"
                disabled={continueDisabled}
                onClick={() => void goNext()}
              >
                {continueCtaLabel}
              </Button>
            ) : null}
          </>
        )}
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
        hideDesktopSummary={segment === "details" || skipFunnelPaymentGuards}
        desktopFooter={desktopFooter}
        main={
          <AnimatePresence mode="wait">
            <motion.div
              key={segment}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "space-y-4 lg:space-y-8",
                segment === "payment"
                  ? "pb-4 max-lg:pb-[11.5rem] lg:pb-0"
                  : showStepNav
                    ? segment === "cleaner"
                      ? "pb-4 max-lg:pb-[10rem] lg:pb-0"
                      : "pb-4 max-lg:pb-5 lg:pb-0"
                    : "pb-5 max-lg:pb-6 lg:pb-0",
              )}
            >
              {segment === "cleaner" ? (
                <div className="mb-4 lg:mb-5">
                  <StepHeader
                    title={checkoutCleanerCopy.title}
                    subtitle={checkoutCleanerCopy.subtitle}
                    subtitleSecondary={checkoutCleanerCopy.subtitleSecondary}
                    badge={checkoutCleanerCopy.badge}
                    badgeAlwaysVisible
                  />
                </div>
              ) : segment === "payment" ? (
                <div className="mb-4 lg:mb-5">
                  <StepHeader title={checkoutPaymentCopy.title} subtitle={checkoutPaymentCopy.stepSubtitle} />
                </div>
              ) : segment !== "schedule" ? (
                <div className="hidden lg:block">
                  <StepHeader
                    {...(segment === "details"
                      ? {
                          title: detailsStepCopy.title,
                          subtitle: detailsStepCopy.stepSubtitle,
                          badge: detailsStepCopy.priceShownBadge,
                        }
                      : { title: SEGMENT_TITLES[segment] })}
                  />
                </div>
              ) : null}
              {segment === "cleaner" && cleanerContinueError ? (
                <p className="text-sm text-red-600 dark:text-red-400">{cleanerContinueError}</p>
              ) : null}
              {children}
            </motion.div>
          </AnimatePresence>
        }
      />

      {segment === "cleaner" && showStepNav ? (
        <div className="fixed inset-x-0 bottom-0 z-50 lg:hidden">
          <MobileBottomBar
            totalDisplay=""
            omitCta
            variant="elevated"
            checkoutDockHideCenter
            checkoutDock={{
              onBack: goBack,
              backDisabled: !prevSeg,
              onContinue: () => void goNext(),
              continueDisabled: continueDisabled || cleanerContinueBusy,
              continueLabel: continueCtaLabel,
              hideContinue: hideContinueOnDetailsPick || !nextSeg,
            }}
          />
        </div>
      ) : null}
    </>
  );
}
