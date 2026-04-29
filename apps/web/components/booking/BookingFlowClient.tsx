"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BOOKING_NODRAFT_QUERY,
  BOOKING_PROMO_QUERY,
  BOOKING_STEP_LS_KEY,
  BOOKING_STEP_QUERY,
  bookingFlowHref,
  bookingFlowPromoExtra,
  getBookingStepGateRedirect,
  normalizeBookingStepParam,
  sanitizeBookingPromoParam,
  type BookingFlowStep,
} from "@/lib/booking/bookingFlow";
import { clearLockedBookingFromStorage, readLockedBookingFromStorage } from "@/lib/booking/lockedBooking";
import { BookingFlowProvider } from "@/components/booking/BookingFlowContext";
import { BookingPriceProvider } from "@/components/booking/BookingPriceContext";
import { BookingStep1Provider } from "@/components/booking/useBookingStep1";
import { StepEntry } from "@/components/booking/steps/StepEntry";
import { StepQuote } from "@/components/booking/steps/StepQuote";
import { StepDetailsForm } from "@/components/booking/steps/StepDetailsForm";
import { StepPayment } from "@/components/booking/steps/StepPayment";
import { StepScheduleV2 } from "@/components/booking/steps/StepScheduleV2";
import { ExitIntentModal } from "@/components/booking/ExitIntentModal";
import {
  bookingRouteToFunnelStep,
  getOrCreateBookingFunnelSessionId,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import { markRetargetingCandidate, trackGrowthEvent } from "@/lib/growth/trackEvent";

function firstSearchParamValue(
  record: Record<string, string | string[] | undefined> | undefined,
  key: string,
): string | null {
  if (!record) return null;
  const v = record[key];
  if (v == null) return null;
  const s = Array.isArray(v) ? v[0] : v;
  return s ?? null;
}

export type BookingFlowClientProps = {
  /** Snapshot from the Server Component — keeps first paint aligned with SSR when `useSearchParams` lags. */
  initialSearchParams?: Record<string, string | string[] | undefined>;
};

export function BookingFlowClient(props: BookingFlowClientProps = {}) {
  const { initialSearchParams } = props;
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawStepQuery =
    searchParams.get(BOOKING_STEP_QUERY) ?? firstSearchParamValue(initialSearchParams, BOOKING_STEP_QUERY);
  const step = normalizeBookingStepParam(rawStepQuery);
  const rawPromo =
    searchParams.get(BOOKING_PROMO_QUERY) ?? firstSearchParamValue(initialSearchParams, BOOKING_PROMO_QUERY);
  const promo = useMemo(() => sanitizeBookingPromoParam(rawPromo), [rawPromo]);
  const promoExtra = useMemo(() => bookingFlowPromoExtra(promo), [promo]);
  const withPromo = useCallback(
    (s: BookingFlowStep) => bookingFlowHref(s, promoExtra),
    [promoExtra],
  );
  const [showNoDraftBanner] = useState(
    () =>
      searchParams.get(BOOKING_NODRAFT_QUERY) === "true" ||
      firstSearchParamValue(initialSearchParams, BOOKING_NODRAFT_QUERY) === "true",
  );
  const [exitIntentOpen, setExitIntentOpen] = useState(false);
  const lastExitIntentAt = useRef(0);
  const trackedViewRef = useRef(false);
  const stepRef = useRef(step);
  stepRef.current = step;

  /** Canonicalize legacy `?step=service` / `who` URLs. */
  useEffect(() => {
    if (rawStepQuery === "service" || rawStepQuery === "who") {
      router.replace(withPromo(normalizeBookingStepParam(rawStepQuery)));
    }
  }, [rawStepQuery, router, withPromo]);

  /** Strip `noDraft` after first paint so the URL stays shareable; banner stays via local state. */
  useEffect(() => {
    if (!showNoDraftBanner) return;
    router.replace(withPromo("entry"));
  }, [router, showNoDraftBanner, withPromo]);

  /** If user opens `/booking` with no `step` query, restore last step from localStorage when allowed. */
  useEffect(() => {
    if (rawStepQuery !== null) return;

    try {
      const saved = localStorage.getItem(BOOKING_STEP_LS_KEY);
      if (!saved) return;

      const stepFromLs = normalizeBookingStepParam(saved);
      const gate = getBookingStepGateRedirect(stepFromLs);
      const target = gate ?? stepFromLs;
      if (target === "entry") return;

      router.replace(withPromo(target));
    } catch {
      /* ignore */
    }
  }, [rawStepQuery, router, withPromo]);

  const goTo = useCallback(
    (s: BookingFlowStep) => {
      router.push(withPromo(s));
    },
    [router, withPromo],
  );

  useEffect(() => {
    getOrCreateBookingFunnelSessionId();
  }, []);

  useEffect(() => {
    trackBookingFunnelEvent(bookingRouteToFunnelStep(step), "view", { route_step: step });
  }, [step]);

  useEffect(() => {
    const onPageHide = () => {
      const s = stepRef.current;
      trackBookingFunnelEvent(bookingRouteToFunnelStep(s), "exit", { route_step: s });
    };
    window.addEventListener("pagehide", onPageHide);
    return () => window.removeEventListener("pagehide", onPageHide);
  }, []);

  useEffect(() => {
    const redirect = getBookingStepGateRedirect(step);
    if (redirect && redirect !== step) {
      router.replace(withPromo(redirect));
    }
  }, [step, router, withPromo]);

  useEffect(() => {
    try {
      localStorage.setItem(BOOKING_STEP_LS_KEY, step);
    } catch {
      /* ignore */
    }
  }, [step]);

  useEffect(() => {
    if (trackedViewRef.current) return;
    trackedViewRef.current = true;
    markRetargetingCandidate(true);
    trackGrowthEvent("page_view", { page_type: "booking_flow" });
  }, []);

  useEffect(() => {
    if (step === "entry") {
      trackGrowthEvent("start_booking", { step });
      trackGrowthEvent("booking_started", { step });
    }
    if (step === "quote") trackGrowthEvent("view_price", { step });
    if (step === "when") trackGrowthEvent("select_time", { step });
  }, [step]);

  /** Exit intent: cursor leaves toward browser chrome (throttled). */
  useEffect(() => {
    const el = document.documentElement;
    function onLeave(e: MouseEvent) {
      if (e.clientY > 0) return;
      const now = Date.now();
      if (now - lastExitIntentAt.current < 90_000) return;
      lastExitIntentAt.current = now;
      setExitIntentOpen(true);
    }
    el.addEventListener("mouseleave", onLeave);
    return () => el.removeEventListener("mouseleave", onLeave);
  }, []);

  /** Exit intent: idle on checkout (20s without interaction). */
  useEffect(() => {
    if (step !== "checkout") return;
    let timer = 0;
    function arm() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setExitIntentOpen(true), 20_000);
    }
    arm();
    const ev = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    const opts = { capture: true, passive: true } as const;
    const reset = () => arm();
    ev.forEach((name) => window.addEventListener(name, reset, opts));
    return () => {
      window.clearTimeout(timer);
      ev.forEach((name) => window.removeEventListener(name, reset, opts));
    };
  }, [step]);

  /** Exit intent: idle on schedule step (12s) — slot selection drop-off. */
  useEffect(() => {
    if (step !== "when") return;
    let timer = 0;
    function arm() {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setExitIntentOpen(true), 12_000);
    }
    arm();
    const ev = ["mousedown", "keydown", "touchstart", "scroll"] as const;
    const opts = { capture: true, passive: true } as const;
    const reset = () => arm();
    ev.forEach((name) => window.addEventListener(name, reset, opts));
    return () => {
      window.clearTimeout(timer);
      ev.forEach((name) => window.removeEventListener(name, reset, opts));
    };
  }, [step]);

  const handleExitIntentComplete = useCallback(() => {
    const locked = readLockedBookingFromStorage();
    if (step === "checkout") {
      window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
      return;
    }
    if (locked) {
      router.push(withPromo("checkout"));
      return;
    }
    if (step === "when") {
      document.getElementById("booking-time-slots")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    router.push(withPromo("when"));
  }, [router, step, withPromo]);

  return (
    <BookingFlowProvider step={step} promoParam={promo}>
      <BookingStep1Provider urlPromo={promo}>
        <BookingPriceProvider>
          <div
            className="flex min-h-dvh flex-col bg-zinc-50 dark:bg-zinc-950"
            data-booking-funnel
            data-booking-route-step={step}
            data-booking-funnel-step={bookingRouteToFunnelStep(step)}
          >
        {step === "entry" && showNoDraftBanner ? (
          <div
            role="status"
            className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100"
          >
            We couldn&apos;t save your selections, but you can continue your booking below.
          </div>
        ) : null}
        <div className="flex min-h-0 flex-1 flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              className="pointer-events-auto flex min-h-0 flex-1 flex-col"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {step === "entry" ? <StepEntry /> : null}
              {step === "quote" ? <StepQuote /> : null}
              {step === "details" ? <StepDetailsForm /> : null}
              {step === "when" ? (
                <StepScheduleV2
                  onNext={() => {
                    trackBookingFunnelEvent("datetime", "next", { route_step: "when" });
                    goTo("checkout");
                  }}
                  onBack={() => goTo("details")}
                />
              ) : null}
              {step === "checkout" ? (
                <Suspense
                  fallback={
                    <div className="flex min-h-dvh flex-1 items-center justify-center text-sm text-zinc-500 dark:text-zinc-400">
                      Loading…
                    </div>
                  }
                >
                  <StepPayment />
                </Suspense>
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>
            <ExitIntentModal
              open={exitIntentOpen}
              onOpenChange={setExitIntentOpen}
              onCompleteBooking={handleExitIntentComplete}
            />
          </div>
        </BookingPriceProvider>
      </BookingStep1Provider>
    </BookingFlowProvider>
  );
}
