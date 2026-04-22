"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import BookingLayout from "@/components/booking/BookingLayout";
import { Step4Payment, type Step4Totals } from "@/components/booking/Step4Payment";
import { Step3CleanerSelection } from "@/components/booking/Step3CleanerSelection";
import { useLockedBooking } from "@/components/booking/useLockedBooking";
import { usePersistedBookingSummaryState } from "@/components/booking/usePersistedBookingSummaryState";
import { useSelectedCleaner } from "@/components/booking/useSelectedCleaner";
import { writeUserEmailToStorage } from "@/lib/booking/userEmailStorage";
import { lockedToStep1State } from "@/lib/booking/lockedBooking";
import { bookingCopy } from "@/lib/booking/copy";

function TrustCheckoutStrip() {
  const lines = bookingCopy.checkout.trust;
  return (
    <ul className="grid gap-2 sm:grid-cols-2" aria-label="Why you can book with confidence">
      {lines.map((text) => (
        <li
          key={text}
          className="rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-2.5 text-xs font-medium leading-snug text-zinc-800 shadow-sm dark:border-zinc-800 dark:bg-zinc-900/60 dark:text-zinc-200"
        >
          {text}
        </li>
      ))}
    </ul>
  );
}

export function StepPayment() {
  const searchParams = useSearchParams();
  const preferRegisterTab = searchParams.get("register") === "1";
  const copy = bookingCopy.checkout;

  const locked = useLockedBooking();
  const selectedCleaner = useSelectedCleaner();
  const step1 = usePersistedBookingSummaryState();

  const [totals, setTotals] = useState<Step4Totals | null>(null);
  const [paying, setPaying] = useState(false);

  const onTotalsChange = useCallback((next: Step4Totals) => {
    setTotals(next);
  }, []);

  const canPay = Boolean(locked && selectedCleaner && totals?.contactReady && totals.totalZar >= 1);

  const continueLabel = totals?.totalZar
    ? `${copy.cta} · R ${totals.totalZar.toLocaleString("en-ZA")}`
    : selectedCleaner
      ? "Enter your details below"
      : "Choose your cleaner";

  const summaryState = useMemo(() => {
    if (locked) return lockedToStep1State(locked);
    return step1;
  }, [locked, step1]);

  async function handlePay() {
    if (!locked || !totals?.contactReady || !selectedCleaner) return;
    setPaying(true);
    try {
      writeUserEmailToStorage(totals.email);

      const res = await fetch("/api/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: totals.email,
          amount: totals.totalZar,
          locked,
          tip: totals.tipZar,
          promoCode: totals.promoCode ?? "",
          cleanerId: selectedCleaner.id,
          cleanerName: selectedCleaner.name,
          accessToken: totals.accessToken ?? "",
          customer: {
            name: totals.name,
            email: totals.email,
            phone: totals.phone,
            userId: totals.userId ?? "",
            type: totals.authMode,
          },
          metadata: { source: "web_checkout" },
        }),
      });
      const data = (await res.json()) as { error?: string; authorizationUrl?: string };
      if (!res.ok) {
        window.alert(data.error ?? "Could not start checkout. Try again.");
        setPaying(false);
        return;
      }
      if (data.authorizationUrl) {
        window.location.assign(data.authorizationUrl);
        return;
      }
      setPaying(false);
    } catch {
      window.alert("Network error. Check your connection and try again.");
      setPaying(false);
    }
  }

  return (
    <BookingLayout
      useFlowHeader
      summaryColumnFirst
      summaryState={summaryState ?? undefined}
      showPricePreview
      stepLabel="Step 5 of 5"
      canContinue={canPay}
      continueLoading={paying}
      continueLabel={continueLabel}
      showContinueArrow={false}
      continueVariant="pay"
      onContinue={handlePay}
      footerSplit
      footerTotalZar={totals?.totalZar}
      footerPreCta={canPay ? copy.speedBeforePay : undefined}
      footerSubcopy={
        canPay ? (
          <p className="text-center text-sm font-medium text-zinc-700 dark:text-zinc-300">{copy.subtext}</p>
        ) : (
          <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
            {bookingCopy.quote.reassurance}
          </p>
        )
      }
    >
      {!locked ? (
        <div className="space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
          <p className="text-sm text-amber-800 dark:text-amber-400/90">
            Choose a time first — then you can confirm and pay here.
          </p>
        </div>
      ) : (
        <div className="space-y-8 pb-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">{copy.title}</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{copy.subtitle}</p>
          </div>

          <section className="space-y-4" aria-labelledby="cleaner-heading">
            <h2 id="cleaner-heading" className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              {copy.cleanerHeading}
            </h2>
            <Step3CleanerSelection slotTime={locked.time} />
          </section>

          {!selectedCleaner ? (
            <p className="rounded-xl border border-amber-200/80 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-50">
              {copy.cleanerHint}
            </p>
          ) : (
            <div className="space-y-6">
              <TrustCheckoutStrip />
              <Step4Payment
                locked={locked}
                cleanerName={selectedCleaner.name}
                preferRegisterTab={preferRegisterTab}
                onTotalsChange={onTotalsChange}
              />
            </div>
          )}
        </div>
      )}
    </BookingLayout>
  );
}
