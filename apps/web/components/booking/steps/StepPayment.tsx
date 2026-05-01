"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { AuthModal } from "@/components/booking/AuthModal";
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
  parseLockedBookingFromUnknown,
  readLockedBookingFromStorage,
  type LockedBooking,
} from "@/lib/booking/lockedBooking";
import { bookingCopy } from "@/lib/booking/copy";
import { formatBookingHoursCompact } from "@/lib/booking/formatBookingHours";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";
import { trackGrowthEvent } from "@/lib/growth/trackEvent";
import { validateLockedBookingBeforePayment } from "@/lib/booking/reconcileBookingState";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function StepPayment() {
  const router = useRouter();
  const { handleBack, bookingHref } = useBookingFlow();
  const searchParams = useSearchParams();
  const preferRegisterTab = searchParams.get("register") === "1";
  const copy = bookingCopy.checkout;
  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const { notice, dismiss, show, showFromPaystackResponse, showNetworkError } = useCheckoutNotice();

  const [totals, setTotals] = useState<Step4Totals | null>(null);
  const [paying, setPaying] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [continueAfterAuth, setContinueAfterAuth] = useState(false);
  const [authOverride, setAuthOverride] = useState<{
    id: string;
    accessToken: string;
    email?: string;
    name?: string;
    phone?: string;
  } | null>(null);
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
    if (!locked || !lgUp) setPromoTipPortalEl(null);
  }, [locked, lgUp]);

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
  const canPay = Boolean(locked && totalReadyForPay && !paying);

  const continueLabel = paying ? "Securing your cleaner…" : "Confirm →";

  function runPaymentFlow() {
    step4Ref.current?.runPayWithContactDialog(() => {
      void handlePay();
    });
  }

  async function handlePay() {
    if (!locked) {
      trackBookingFunnelEvent("payment", "error", { message: "missing_lock", action: "pay" });
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
      trackBookingFunnelEvent("payment", "error", { message: "contact_not_ready", action: "pay" });
      show({
        tone: "danger",
        title: "Almost there",
        description: "Confirm your name, phone, and email in the contact step, then try paying again.",
        autoDismissMs: 5000,
      });
      return;
    }

    if (!totals.authenticated || !totals.accessToken || !totals.userId) {
      setContinueAfterAuth(true);
      setAuthModalOpen(true);
      return;
    }

    if (payInitInFlight.current) return;
    payInitInFlight.current = true;
    setPaying(true);
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
        setPaying(false);
        payInitInFlight.current = false;
        const msg = ve instanceof Error ? ve.message : "Invalid booking";
        trackBookingFunnelEvent("payment", "error", { message: `client_state:${msg}`, action: "validate_booking_state" });
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
        setPaying(false);
        payInitInFlight.current = false;
        trackBookingFunnelEvent("payment", "error", {
          message: `revalidate_lock:${revalidateJson.reason ?? revalidateRes.status}`,
          action: "revalidate_lock",
        });
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
        setPaying(false);
        trackBookingFunnelEvent("payment", "error", { message: "extras_mismatch_client", action: "validate_extras" });
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
        trackBookingFunnelEvent("payment", "error", {
          message: lastValidateRes.ok ? `slot_invalid:${validateData.reason ?? "unknown"}` : `validate_http_${lastValidateRes.status}`,
          action: "validate_slot",
        });
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

      trackGrowthEvent("payment_initiated", {
        step: "checkout",
        service: lockedForValidate.service ?? null,
        total_zar: totals.totalZar,
      });

      const paystackBody = {
        email: totals.email,
        locked: lockedForValidate,
        tip: totals.tipZar,
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
        metadata: { source: "web_checkout", subscriptionFrequency: totals.subscriptionFrequency ?? "" },
        referralCode: totals.referralCode ?? "",
      };
      trackBookingFunnelEvent("payment", "next", { action: "paystack_init" });

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
        trackBookingFunnelEvent("payment", "error", {
          message: typeof data.error === "string" ? data.error : `paystack_init_${res.status}`,
          action: "paystack_initialize",
        });
        showFromPaystackResponse(data, { onChooseAnotherTime: goChooseAnotherTime });
        return;
      }

      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }

      trackBookingFunnelEvent("payment", "error", { message: "missing_authorization_url", action: "paystack_initialize" });
      show({
        tone: "danger",
        title: "Payment couldn’t start",
        description: "Something went wrong. Please try again in a moment.",
        autoDismissMs: 5000,
      });
    } catch (e) {
      trackBookingFunnelEvent("payment", "error", {
        message: e instanceof Error ? e.message : "pay_network",
        action: "pay",
      });
      showNetworkError();
    } finally {
      payInitInFlight.current = false;
      setPaying(false);
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

  useEffect(() => {
    if (!continueAfterAuth) return;
    if (!totals?.authenticated || !totals.userId || !totals.accessToken) return;
    setContinueAfterAuth(false);
    void handlePay();
  }, [continueAfterAuth, totals]);

  return (
    <BookingLayout
      summaryDesktopOnly
      summaryOverride={checkoutDesktopSidebar ?? undefined}
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
        ctaShort: "Confirm →",
        hideMobilePrice: true,
      }}
      footerTotalZar={totals?.totalZar}
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
        <div className="mx-auto w-full max-w-[576px] space-y-5 pb-4 max-lg:space-y-5 lg:space-y-6 lg:pb-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="text-sm text-amber-800 dark:text-amber-400/90">
            Choose a time first — then you can confirm and pay here.
          </p>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[576px] space-y-4 pb-4 lg:space-y-6 lg:pb-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
          </div>
          <Step4Payment
            ref={step4Ref}
            locked={locked}
            cleanerName={selectedCleaner?.name ?? "Auto-assigned cleaner"}
            preferRegisterTab={preferRegisterTab}
            authOverride={authOverride}
            onTotalsChange={onTotalsChange}
            checkoutPromoInSidebar={lgUp}
            promoTipPortalEl={promoTipPortalEl}
          />
        </div>
      )}
      <AuthModal
        open={authModalOpen}
        onOpenChange={setAuthModalOpen}
        defaultTab={preferRegisterTab ? "signup" : "login"}
        prefillEmail={totals?.email ?? ""}
        prefillName={totals?.name ?? ""}
        prefillPhone={totals?.phone ?? ""}
        onAuthenticated={(session) => {
          setAuthOverride(session);
          setAuthModalOpen(false);
        }}
      />
    </BookingLayout>
  );
}
