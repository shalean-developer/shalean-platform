"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { CheckoutNoticeBanner } from "@/components/booking/CheckoutNoticeBanner";
import { Step4Payment, type Step4Totals } from "@/components/booking/Step4Payment";
import { useCheckoutNotice } from "@/components/booking/useCheckoutNotice";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { bookingFlowHref } from "@/lib/booking/bookingFlow";
import { writeUserEmailToStorage } from "@/lib/booking/userEmailStorage";
import {
  getLockedBookingDisplayPrice,
  lockedToStep1State,
  mergeCleanerIdIntoLockedBooking,
  readLockedBookingFromStorage,
} from "@/lib/booking/lockedBooking";
import { bookingCopy } from "@/lib/booking/copy";

export function StepPayment() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const preferRegisterTab = searchParams.get("register") === "1";
  const copy = bookingCopy.checkout;
  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const step1 = usePersistedBookingSummaryState();
  const { notice, dismiss, show, showFromPaystackResponse, showNetworkError } = useCheckoutNotice();

  const [totals, setTotals] = useState<Step4Totals | null>(null);
  const [paying, setPaying] = useState(false);
  const checkoutRedirected = useRef(false);

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
      router.replace(bookingFlowHref("when"));
    });
    return () => cancelAnimationFrame(id);
  }, [locked, router, show]);

  const goChooseAnotherTime = useCallback(() => {
    router.push(`${bookingFlowHref("when")}#booking-time-slots`);
  }, [router]);

  const onTotalsChange = useCallback((next: Step4Totals) => {
    setTotals(next);
  }, []);

  const readyForPaystack = Boolean(
    locked && totals?.contactReady && totals.totalZar >= 1,
  );
  /** Enable CTA only when payment data is truly ready. */
  const canPay = Boolean(locked && readyForPaystack && !paying);

  const continueLabel = paying ? "Securing your cleaner…" : "Confirm →";

  const summaryState = useMemo(() => {
    if (locked) return lockedToStep1State(locked);
    return step1;
  }, [locked, step1]);

  async function handlePay() {
    if (!locked) {
      show({
        tone: "danger",
        title: "Your session expired",
        description: "Please choose your time again.",
        autoDismissMs: 6000,
        cta: { label: "Choose another time", onClick: goChooseAnotherTime },
      });
      router.push(bookingFlowHref("when"));
      return;
    }

    if (!totals?.contactReady || !Number.isFinite(totals.totalZar) || totals.totalZar < 1) {
      show({
        tone: "danger",
        title: "Almost there",
        description: "Enter your contact details above so we can complete secure payment.",
        autoDismissMs: 5000,
      });
      return;
    }

    setPaying(true);
    try {
      const cleanerId = selectedCleaner?.id ?? null;
      if (cleanerId) mergeCleanerIdIntoLockedBooking(cleanerId);
      const freshLock = readLockedBookingFromStorage();
      const lockedForValidate = freshLock
        ? { ...freshLock, cleaner_id: cleanerId ?? freshLock.cleaner_id ?? null }
        : { ...locked, cleaner_id: cleanerId ?? locked.cleaner_id ?? null };

      console.log("LOCKED BOOKING:", lockedForValidate);
      console.log("LOCKED PRICE:", getLockedBookingDisplayPrice(lockedForValidate));

      const validateRes = await fetch("/api/booking/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          locked: lockedForValidate,
          cleaner_id: cleanerId,
          cleanerId,
          date: locked.date,
          time: locked.time,
          duration_minutes: Math.round(locked.finalHours * 60),
        }),
      });

      let validateData: { valid?: boolean } = {};
      try {
        validateData = (await validateRes.json()) as { valid?: boolean };
      } catch {
        validateData = {};
      }

      if (!validateRes.ok) {
        show({
          tone: "danger",
          title: "Something went wrong",
          description:
            validateRes.status >= 500
              ? "Our servers are busy. Please try again in a moment."
              : "We couldn’t verify this slot. Please try again.",
          autoDismissMs: 5000,
        });
        return;
      }

      if (validateData.valid !== true) {
        show({
          tone: "danger",
          title: "Time slot unavailable",
          description: "This time was just booked. Please choose another available slot.",
          autoDismissMs: 6000,
          cta: { label: "Choose another time", onClick: goChooseAnotherTime },
        });
        return;
      }

      writeUserEmailToStorage(totals.email);

      const paystackBody = {
        email: totals.email,
        amount: totals.totalZar,
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
      console.log("PAYLOAD:", paystackBody);

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
        showFromPaystackResponse(data, { onChooseAnotherTime: goChooseAnotherTime });
        return;
      }

      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }

      show({
        tone: "danger",
        title: "Payment couldn’t start",
        description: "Something went wrong. Please try again in a moment.",
        autoDismissMs: 5000,
      });
    } catch (e) {
      console.error("Booking confirm error:", e);
      showNetworkError();
    } finally {
      setPaying(false);
    }
  }

  return (
    <BookingLayout
      canContinue={canPay}
      continueLoading={paying}
      continueLabel={continueLabel}
      showContinueArrow={false}
      continueVariant="pay"
      onContinue={handlePay}
      stickyMobileBar={{
        totalZar: totals?.totalZar ?? 0,
        amountDisplayOverride: totals?.totalZar ? null : "—",
        totalCaption: "Total",
        ctaShort: "Confirm →",
      }}
      footerTotalZar={totals?.totalZar}
      footerPreCta={readyForPaystack ? copy.speedBeforePay : undefined}
      footerSubcopy={readyForPaystack ? <p className="text-center text-sm font-medium text-zinc-700 dark:text-zinc-300">{copy.subtext}</p> : undefined}
    >
      <CheckoutNoticeBanner
        open={Boolean(notice?.open)}
        tone={notice?.tone ?? "danger"}
        title={notice?.title ?? ""}
        description={notice?.description ?? ""}
        onDismiss={dismiss}
        autoDismissMs={notice?.autoDismissMs}
        cta={notice?.cta}
      />
      {!locked ? (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="text-sm text-amber-800 dark:text-amber-400/90">
            Choose a time first — then you can confirm and pay here.
          </p>
        </div>
      ) : (
        <div className="space-y-6 pb-4">
          <div
            className="rounded-xl border border-amber-200/90 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100"
            role="status"
          >
            <span>This booking is locked for checkout. Complete payment below to confirm your visit.</span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
          </div>

          <Step4Payment
            locked={locked}
            cleanerName={selectedCleaner?.name ?? "Auto-assigned cleaner"}
            preferRegisterTab={preferRegisterTab}
            onTotalsChange={onTotalsChange}
          />
        </div>
      )}
    </BookingLayout>
  );
}
