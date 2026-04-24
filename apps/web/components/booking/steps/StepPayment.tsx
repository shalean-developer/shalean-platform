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
import { extrasSnapshotAligned } from "@/lib/booking/extrasSnapshot";
import {
  lockedToStep1State,
  mergeCleanerIdIntoLockedBooking,
  parseLockedBookingFromUnknown,
  readLockedBookingFromStorage,
} from "@/lib/booking/lockedBooking";
import { bookingCopy } from "@/lib/booking/copy";
import { trackBookingFunnelEvent } from "@/lib/booking/bookingFlowAnalytics";

const HELD_WINDOW_MS = 5 * 60 * 1000;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function SlotHoldCountdown({ lockedAt }: { lockedAt: string }) {
  const endMs = useMemo(() => {
    const t = Date.parse(lockedAt);
    if (!Number.isFinite(t)) return null;
    return t + HELD_WINDOW_MS;
  }, [lockedAt]);

  const [remainingSec, setRemainingSec] = useState(0);

  useEffect(() => {
    if (endMs == null) return;
    const tick = () => setRemainingSec(Math.max(0, Math.floor((endMs - Date.now()) / 1000)));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endMs]);

  if (endMs == null) {
    return (
      <p className="text-center text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
        {bookingCopy.checkout.slotHeldFallback}
      </p>
    );
  }

  if (remainingSec <= 0) {
    return (
      <p className="text-center text-[11px] leading-snug text-amber-800 dark:text-amber-200">
        If payment does not go through, choose your time again to refresh your quote.
      </p>
    );
  }

  const minutes = Math.max(1, Math.ceil(remainingSec / 60));
  return (
    <p className="text-center text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
      <span className="font-semibold text-zinc-800 dark:text-zinc-100">
        ~{minutes} min left at this price
      </span>
      <span className="text-zinc-500 dark:text-zinc-500"> · </span>
      <span>Checkout usually under 1 minute</span>
    </p>
  );
}

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
  /** Blocks double-clicks before React re-renders `paying`. Cleared in `finally`. */
  const payInitInFlight = useRef(false);

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
      trackBookingFunnelEvent("payment", "error", { message: "missing_lock", action: "pay" });
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
      trackBookingFunnelEvent("payment", "error", { message: "contact_not_ready", action: "pay" });
      show({
        tone: "danger",
        title: "Almost there",
        description: "Enter your contact details above so we can complete secure payment.",
        autoDismissMs: 5000,
      });
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
          cta: { label: "Home details", onClick: () => router.push(bookingFlowHref("details")) },
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
            ? { label: "Home details", onClick: () => router.push(bookingFlowHref("details")) }
            : { label: "Choose another time", onClick: goChooseAnotherTime },
        });
        return;
      }

      writeUserEmailToStorage(totals.email);

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
      footerPreCta={locked && readyForPaystack ? <SlotHoldCountdown lockedAt={locked.lockedAt} /> : undefined}
      footerSubcopy={
        readyForPaystack ? (
          <div className="mx-auto max-w-md space-y-1 text-center">
            <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{copy.subtext}</p>
            <p className="text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">{copy.payFooterTrustLine}</p>
          </div>
        ) : undefined
      }
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
