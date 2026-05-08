"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { CheckoutSideBadge } from "@/components/booking/CheckoutSideBadge";
import { CheckoutNoticeBanner } from "@/components/booking/CheckoutNoticeBanner";
import { CheckoutRescheduleModal } from "@/components/booking/CheckoutRescheduleModal";
import { useBookingFlow } from "@/components/booking/BookingFlowContext";
import { Step4Payment, type Step4PaymentHandle, type Step4Totals } from "@/components/booking/Step4Payment";
import { useCheckoutNotice } from "@/components/booking/useCheckoutNotice";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { writeUserEmailToStorage } from "@/lib/booking/userEmailStorage";
import { extrasSnapshotAligned } from "@/lib/booking/extrasSnapshot";
import {
  mergeCleanerIdIntoLockedBooking,
  formatLockedAppointmentLabel,
  parseLockedBookingFromUnknown,
  readLockedBookingFromStorage,
  type LockedBooking,
} from "@/lib/booking/lockedBooking";
import { bookingCopy } from "@/lib/booking/copy";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";
import {
  ANALYTICS_EVENTS,
  BOOKING_FUNNEL_ROW,
  trackBookingAnalyticsEvent,
  trackBookingFunnelEvent,
} from "@/lib/booking/bookingFlowAnalytics";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { getAnalyticsSessionId } from "@/lib/analytics/sessionId";
import { validateLockedBookingBeforePayment } from "@/lib/booking/reconcileBookingState";
import { getBookingSummaryServiceLabel } from "@/components/booking/serviceCategories";
import { getBookingExperimentAssignments } from "@/lib/booking/bookingExperiments";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function StepPayment() {
  const router = useRouter();
  const { handleBack, bookingHref } = useBookingFlow();
  const copy = bookingCopy.checkout;
  const experiments = useMemo(() => getBookingExperimentAssignments(), []);
  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const { notice, dismiss, show, showFromPaystackResponse, showNetworkError } = useCheckoutNotice();

  const [totals, setTotals] = useState<Step4Totals | null>(null);
  const [paymentPhase, setPaymentPhase] = useState<"idle" | "initializing" | "redirecting">("idle");
  const checkoutRedirected = useRef(false);
  /** Blocks double-clicks before React re-renders `paying`. Cleared in `finally`. */
  const payInitInFlight = useRef(false);
  /** Desktop checkout sidebar mount for promo/tip portal (from `CheckoutSideBadge`). */
  const [promoTipPortalEl, setPromoTipPortalEl] = useState<HTMLDivElement | null>(null);
  const bindPromoTipHost = useCallback((el: HTMLDivElement | null) => {
    setPromoTipPortalEl(el);
  }, []);

  const step4Ref = useRef<Step4PaymentHandle>(null);

  /** `lg` sidebar is `hidden` below this width but stays in DOM — only portal promo/tip when it is actually shown. */
  const [lgUp, setLgUp] = useState(false);
  useLayoutEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const apply = () => setLgUp(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (locked || checkoutRedirected.current) return;
    const id = requestAnimationFrame(() => {
      if (readLockedBookingFromStorage()) return;
      if (checkoutRedirected.current) return;
      checkoutRedirected.current = true;
      show({
        tone: "danger",
        title: bookingCopy.errors.selectTimeFirst,
        description: "Pick an arrival window to lock your visit total, then return here to pay.",
        autoDismissMs: 7000,
      });
      router.replace(bookingHref("when"));
    });
    return () => cancelAnimationFrame(id);
  }, [locked, router, show, bookingHref]);

  const goChooseAnotherTime = useCallback(() => {
    router.push(`${bookingHref("when")}#booking-time-slots`);
  }, [router, bookingHref]);

  const onTotalsChange = useCallback((next: Step4Totals) => {
    setTotals(next);
  }, []);

  const totalReadyForPay = Boolean(
    locked && totals != null && Number.isFinite(totals.totalZar) && totals.totalZar >= 1,
  );
  /** Confirm opens contact dialog first; CTA enabled when visit total is valid (contact confirmed in dialog). */
  const paying = paymentPhase !== "idle";
  const canPay = Boolean(locked && totalReadyForPay && !paying);

  const continueLabel =
    paymentPhase === "redirecting"
      ? "Redirecting to Paystack..."
      : paymentPhase === "initializing"
        ? "Payment initializing..."
        : experiments.cta_wording === "variant_a"
          ? copy.ctaAlt
          : copy.cta;
  const paymentTrust =
    experiments.trust_badges === "variant_a" ? copy.paymentTrustAlt : copy.paymentTrust;

  function trackValidationFailure(reason: string, action: string, state: LockedBooking | null = locked) {
    trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_VALIDATION_FAILED, state, {
      validation_reason: reason,
      validation_action: action,
      step: "checkout",
      selected_extras: state?.extras ?? locked?.extras ?? [],
      estimated_price: totals?.totalZar ?? state?.finalPrice ?? null,
      estimated_hours: state?.finalHours ?? locked?.finalHours ?? null,
      cleaner_mode: selectedCleaner?.id ? "manual" : "auto",
      cleaner_id: selectedCleaner?.id ?? null,
      experiment_cta_wording: experiments.cta_wording,
      experiment_trust_badges: experiments.trust_badges,
    });
  }

  function runPaymentFlow() {
    trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_CTA_CLICKED, locked, {
      cta_id: "checkout_confirm",
      cta_label: continueLabel,
      cta_destination_step: "paystack",
      step: "checkout",
      selected_extras: locked?.extras ?? [],
      estimated_price: totals?.totalZar ?? locked?.finalPrice ?? null,
      estimated_hours: locked?.finalHours ?? null,
      cleaner_mode: selectedCleaner?.id ? "manual" : "auto",
      cleaner_id: selectedCleaner?.id ?? null,
    });
    step4Ref.current?.runPayWithContactDialog(() => {
      void handlePay();
    });
  }

  async function handlePay() {
    if (!locked) {
      trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, { message: "missing_lock", action: "pay" });
      trackValidationFailure("missing_lock", "pay", null);
      show({
        tone: "danger",
        title: "Your session expired",
        description: "Please choose your time again.",
        autoDismissMs: 6000,
        cta: { label: "Choose another time", onClick: goChooseAnotherTime },
      });
      router.push(bookingHref("when"));
      return;
    }

    if (!totals?.contactReady || !Number.isFinite(totals.totalZar) || totals.totalZar < 1) {
      trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, { message: "contact_not_ready", action: "pay" });
      trackValidationFailure("contact_not_ready", "pay", locked);
      show({
        tone: "danger",
        title: "Almost there",
        description: "Confirm your name, phone, and email in the contact step, then try paying again.",
        autoDismissMs: 5000,
      });
      return;
    }

    if (payInitInFlight.current) return;
    payInitInFlight.current = true;
    setPaymentPhase("initializing");
    try {
      const cleanerId = selectedCleaner?.id ?? null;
      if (cleanerId) mergeCleanerIdIntoLockedBooking(cleanerId);
      const freshLock = readLockedBookingFromStorage();
      const lockedForValidate = freshLock
        ? { ...freshLock, cleaner_id: cleanerId ?? freshLock.cleaner_id ?? null }
        : { ...locked, cleaner_id: cleanerId ?? locked.cleaner_id ?? null };

      try {
        validateLockedBookingBeforePayment(lockedForValidate as LockedBooking, cleanerId);
      } catch (ve) {
        setPaymentPhase("idle");
        payInitInFlight.current = false;
        const msg = ve instanceof Error ? ve.message : "Invalid booking";
        trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, { message: `client_state:${msg}`, action: "validate_booking_state" });
        trackValidationFailure(`client_state:${msg}`, "validate_booking_state", lockedForValidate as LockedBooking);
        show({
          tone: "danger",
          title: "Incomplete booking",
          description: msg,
          autoDismissMs: 6000,
          cta: { label: "Go back", onClick: () => router.push(bookingHref("details")) },
        });
        return;
      }

      console.log("[BOOKING STATE VALIDATED]", { step: "checkout", valid: true });

      const revalidateRes = await fetch("/api/booking/revalidate-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingDraft: {
            locked: lockedForValidate,
            cleaner_id: cleanerId,
            cleanerId,
            date: lockedForValidate.date,
            time: lockedForValidate.time,
            duration_minutes: Math.round(lockedForValidate.finalHours * 60),
          },
        }),
      });
      let revalidateJson: { ok?: boolean; valid?: boolean; reason?: string } = {};
      try {
        revalidateJson = (await revalidateRes.json()) as typeof revalidateJson;
      } catch {
        revalidateJson = {};
      }
      if (!revalidateRes.ok || revalidateJson.ok === false || revalidateJson.valid === false) {
        setPaymentPhase("idle");
        payInitInFlight.current = false;
        trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, {
          message: `revalidate_lock:${revalidateJson.reason ?? revalidateRes.status}`,
          action: "revalidate_lock",
        });
        trackValidationFailure(
          `revalidate_lock:${revalidateJson.reason ?? revalidateRes.status}`,
          "revalidate_lock",
          lockedForValidate as LockedBooking,
        );
        show({
          tone: "danger",
          title: "Could not confirm booking",
          description:
            revalidateJson.reason === "extras_mismatch"
              ? "Your add-ons are out of sync with the locked price. Go back to home details, then pick your time again."
              : "We could not verify this visit on the server. Go back and try again, or pick another time.",
          autoDismissMs: 7000,
          cta: { label: "Choose another time", onClick: goChooseAnotherTime },
        });
        return;
      }

      const parsedForExtras = parseLockedBookingFromUnknown(lockedForValidate);
      if (!parsedForExtras || !extrasSnapshotAligned(parsedForExtras)) {
        setPaymentPhase("idle");
        trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, { message: "extras_mismatch_client", action: "validate_extras" });
        trackValidationFailure("extras_mismatch_client", "validate_extras", lockedForValidate as LockedBooking);
        show({
          tone: "danger",
          title: "Add-ons out of sync",
          description:
            "Your selected extras don’t match the locked visit price. Go back to home details to refresh add-ons, then choose your time again before paying.",
          autoDismissMs: 8000,
          cta: { label: "Home details", onClick: () => router.push(bookingHref("details")) },
        });
        return;
      }

      const validateBody = JSON.stringify({
        locked: lockedForValidate,
        cleaner_id: cleanerId,
        cleanerId,
        date: locked.date,
        time: locked.time,
        duration_minutes: Math.round(locked.finalHours * 60),
      });

      let validateOk = false;
      let lastValidateRes: Response | null = null;
      let validateData: { valid?: boolean; reason?: string } = {};

      for (let attempt = 0; attempt < 3; attempt++) {
        const validateRes = await fetch("/api/booking/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: validateBody,
        });
        lastValidateRes = validateRes;
        try {
          validateData = (await validateRes.json()) as { valid?: boolean; reason?: string };
        } catch {
          validateData = {};
        }
        if (validateRes.ok && validateData.valid === true) {
          validateOk = true;
          break;
        }
        if (attempt < 2) await sleep(450 * (attempt + 1));
      }

      if (!validateOk && lastValidateRes) {
        const reason = validateData.reason;
        let description =
          lastValidateRes.status >= 500
            ? "Our servers are busy. Please try again in a moment."
            : "We couldn’t verify this slot after a few tries. Pick another time and try again.";
        if (lastValidateRes.ok && validateData.valid !== true) {
          description = "This time was just booked. Please choose another available slot.";
        }
        if (lastValidateRes.status === 400) {
          if (reason === "missing_fields") {
            description =
              "We’re missing your visit date or time. Go back to scheduling and pick a slot again.";
          } else if (reason === "bad_time") {
            description = "We couldn’t read the visit time. Choose your slot again, then continue to payment.";
          } else if (reason === "bad_json") {
            description = "The request was invalid. Refresh the page and try again.";
          } else if (reason === "extras_mismatch") {
            description =
              "Your selected extras don’t match the locked price. Go back to home details, confirm add-ons, then pick your time again.";
          }
        }
        trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, {
          message: lastValidateRes.ok ? `slot_invalid:${validateData.reason ?? "unknown"}` : `validate_http_${lastValidateRes.status}`,
          action: "validate_slot",
        });
        trackValidationFailure(
          lastValidateRes.ok ? `slot_invalid:${validateData.reason ?? "unknown"}` : `validate_http_${lastValidateRes.status}`,
          "validate_slot",
          lockedForValidate as LockedBooking,
        );
        const extrasMismatch = validateData.reason === "extras_mismatch";
        show({
          tone: "danger",
          title: extrasMismatch
            ? "Add-ons need a refresh"
            : lastValidateRes.ok
              ? "Time slot unavailable"
              : "Something went wrong",
          description,
          autoDismissMs: 6000,
          cta: extrasMismatch
            ? { label: "Home details", onClick: () => router.push(bookingHref("details")) }
            : { label: "Choose another time", onClick: goChooseAnotherTime },
        });
        return;
      }

      writeUserEmailToStorage(totals.email);

      trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_PAYMENT_STARTED, lockedForValidate, {
        date: lockedForValidate.date,
        time: lockedForValidate.time,
        selected_extras: lockedForValidate.extras,
        estimated_price: totals.totalZar,
        estimated_hours: lockedForValidate.finalHours,
        cleaner_mode: cleanerId ? "manual" : "auto",
        cleaner_id: cleanerId,
        auth_mode: totals.authMode,
        payment_provider: "paystack",
      });
      trackGrowthEvent(ANALYTICS_EVENTS.PAYMENT_INITIATED, {
        step: "checkout",
        service: lockedForValidate.service ?? null,
        total_zar: totals.totalZar,
      });

      const paystackBody = {
        email: totals.email,
        locked: lockedForValidate,
        tip: 0,
        promoCode: totals.promoCode ?? "",
        cleanerId,
        cleanerName: selectedCleaner?.name ?? "Auto-assigned cleaner",
        accessToken: totals.accessToken ?? "",
        customer: {
          name: totals.name,
          email: totals.email,
          phone: totals.phone,
          userId: totals.userId ?? "",
          type: totals.authMode,
        },
        metadata: {
          source: "web_checkout",
          subscriptionFrequency: totals.subscriptionFrequency ?? "",
          payment_mode: "funnel",
          analytics_session_id: (() => {
            const sid = getAnalyticsSessionId();
            return sid === "server" ? "" : sid;
          })(),
        },
        referralCode: totals.referralCode ?? "",
      };
      trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.NEXT, { action: "paystack_init" });

      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(paystackBody),
      });

      const data = (await res.json()) as {
        error?: string;
        errorCode?: string;
        authorizationUrl?: string;
      };

      if (!res.ok) {
        trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, {
          message: typeof data.error === "string" ? data.error : `paystack_init_${res.status}`,
          action: "paystack_initialize",
        });
        trackValidationFailure(
          typeof data.error === "string" ? data.error : `paystack_init_${res.status}`,
          "paystack_initialize",
          lockedForValidate as LockedBooking,
        );
        showFromPaystackResponse(data, { onChooseAnotherTime: goChooseAnotherTime });
        return;
      }

      if (data.authorizationUrl) {
        setPaymentPhase("redirecting");
        checkoutRedirected.current = true;
        trackBookingAnalyticsEvent(ANALYTICS_EVENTS.BOOKING_PAYSTACK_OPENED, lockedForValidate, {
          date: lockedForValidate.date,
          time: lockedForValidate.time,
          selected_extras: lockedForValidate.extras,
          estimated_price: totals.totalZar,
          estimated_hours: lockedForValidate.finalHours,
          cleaner_mode: cleanerId ? "manual" : "auto",
          cleaner_id: cleanerId,
          payment_provider: "paystack",
        });
        window.location.assign(data.authorizationUrl);
        return;
      }

      trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, { message: "missing_authorization_url", action: "paystack_initialize" });
      show({
        tone: "danger",
        title: "Payment couldn’t start",
        description: "Something went wrong. Please try again in a moment.",
        autoDismissMs: 5000,
      });
    } catch (e) {
      trackBookingFunnelEvent("payment", BOOKING_FUNNEL_ROW.ERROR, {
        message: e instanceof Error ? e.message : "pay_network",
        action: "pay",
      });
      showNetworkError();
    } finally {
      payInitInFlight.current = false;
      if (!checkoutRedirected.current) setPaymentPhase("idle");
    }
  }

  /** Checkout step: no `BookingSummary` sidebar — only the pay rail when locked. */
  const checkoutDesktopSidebar = locked ? (
    <CheckoutSideBadge
      mode="desktop"
      lockedAt={locked.lockedAt}
      showCountdown={totalReadyForPay}
      totalZar={totals?.totalZar ?? null}
      amountDisplayOverride={totals?.totalZar ? null : "—"}
      canPay={canPay}
      paying={paying}
      onPay={runPaymentFlow}
      onBack={handleBack}
      continueLabel={continueLabel}
      promoTipHostRef={lgUp ? bindPromoTipHost : undefined}
    />
  ) : null;

  const checkoutMobileSummary = locked ? (
    <section className="space-y-4" aria-label="Booking summary">
      <div>
        <h2 className="text-base font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Booking summary</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">Review the visit you are about to confirm.</p>
      </div>
      <dl className="space-y-2.5 rounded-xl border border-zinc-200/80 bg-zinc-50/70 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-900/40">
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">What</dt>
          <dd className="min-w-0 text-right font-semibold text-zinc-900 dark:text-zinc-50">
            {getBookingSummaryServiceLabel(locked.service, locked.service_type)}
          </dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">Where</dt>
          <dd className="min-w-0 text-right text-zinc-800 dark:text-zinc-100">{locked.location || "Address on file"}</dd>
        </div>
        <div className="flex items-start justify-between gap-3">
          <dt className="shrink-0 font-medium text-zinc-500 dark:text-zinc-400">When</dt>
          <dd className="min-w-0 text-right text-zinc-800 dark:text-zinc-100">{formatLockedAppointmentLabel(locked)}</dd>
        </div>
        <div className="flex items-start justify-between gap-3 border-t border-zinc-200/80 pt-2 dark:border-zinc-700">
          <dt className="shrink-0 font-semibold text-zinc-700 dark:text-zinc-200">Total</dt>
          <dd className="shrink-0 text-right text-lg font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
            {totals?.totalZar ? `R ${totals.totalZar.toLocaleString("en-ZA")}` : "-"}
          </dd>
        </div>
      </dl>
      <div className="flex flex-wrap gap-1.5">
        {paymentTrust.map((line) => (
          <span
            key={line}
            className="rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-100"
          >
            {line}
          </span>
        ))}
      </div>
    </section>
  ) : null;

  return (
    <BookingLayout
      summaryDesktopOnly
      summaryOverride={checkoutDesktopSidebar ?? undefined}
      mobileSummaryOverride={checkoutMobileSummary ?? undefined}
      canContinue={canPay}
      continueLoading={paying}
      continueLabel={continueLabel}
      showContinueArrow={false}
      continueVariant="pay"
      onContinue={runPaymentFlow}
      showStickyPriceBarDesktop={false}
      stickyMobileBar={{
        totalZar: totals?.totalZar ?? 0,
        amountDisplayOverride: totals?.totalZar ? null : "—",
        totalCaption: "Total",
        mobileHoursLine: locked ? formatBookingHoursCompact(locked.finalHours) : null,
        ctaShort: experiments.cta_wording === "variant_a" ? copy.ctaAlt : copy.cta,
        openSummarySheetOnAmountTap: true,
      }}
      footerTotalZar={totals?.totalZar}
      footerPreCta={locked ? copy.payFooterTrustLine : null}
    >
      <CheckoutNoticeBanner
        open={Boolean(notice?.open && !notice.rescheduleInModal)}
        tone={notice?.tone ?? "danger"}
        title={notice?.title ?? ""}
        description={notice?.description ?? ""}
        onDismiss={dismiss}
        autoDismissMs={notice?.autoDismissMs}
        cta={notice?.cta}
      />
      <CheckoutRescheduleModal
        open={Boolean(notice?.open && notice.rescheduleInModal && locked)}
        onOpenChange={(next) => {
          if (!next) dismiss();
        }}
        title={notice?.title ?? ""}
        description={notice?.description ?? ""}
        onLocked={dismiss}
      />
      {!locked ? (
        <div className="mx-auto w-full max-w-[576px] space-y-4 pb-4 lg:space-y-6 lg:pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="text-sm text-amber-800 dark:text-amber-400/90">
            Choose a time first — then you can confirm and pay here.
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[576px] space-y-3 pb-4 lg:space-y-6 lg:pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
          </div>
          <Step4Payment
            ref={step4Ref}
            locked={locked}
            cleanerName={selectedCleaner?.name ?? "Auto-assigned cleaner"}
            onTotalsChange={onTotalsChange}
            checkoutPromoInSidebar={lgUp}
            promoTipPortalEl={promoTipPortalEl}
          />
        </div>
      )}
    </BookingLayout>
  );
}
