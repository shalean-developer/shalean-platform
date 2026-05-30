"use client";

import { BookingSectionCard } from "@/components/booking/checkout/BookingSectionCard";
import { Button } from "@/components/ui/button";
import type { BookingAnalyticsState } from "@/lib/booking/bookingFlowAnalytics";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { type UnifiedPaymentMode, useUnifiedPaymentFlow } from "@/lib/booking/useUnifiedPaymentFlow";
import { cn } from "@/lib/utils";
import { BookingReviewPanel } from "./BookingReviewPanel";
import { PaymentMethodCard } from "./PaymentMethodCard";
import { PaymentPricingAccordion } from "./PaymentPricingAccordion";
import { RetryPaymentNotice } from "./RetryPaymentNotice";
import { TrustReinforcementCard } from "./TrustReinforcementCard";
import { bookingCopy } from "@/lib/booking/copy";

const payCopy = bookingCopy.checkoutPayment;

type Props = {
  summary: BookingPaymentSummary;
  paymentMode: UnifiedPaymentMode;
  attributionSource: string | null;
  analyticsState?: BookingAnalyticsState | null;
  onBack: () => void;
};

export function ExistingBookingPaymentPanel({
  summary,
  paymentMode,
  attributionSource,
  analyticsState,
  onBack,
}: Props) {
  const { busy, error, message, handlePay, payDisabled } = useUnifiedPaymentFlow({
    summary,
    paymentMode,
    attributionSource,
    analyticsState,
  });

  const primaryDisabled = payDisabled || busy;

  return (
    <div className="space-y-3 lg:space-y-4">
      <RetryPaymentNotice paymentMode={paymentMode} />

      <BookingSectionCard className="border-zinc-200/90 p-4 shadow-md shadow-zinc-900/[0.04] sm:p-5 dark:border-zinc-800 dark:shadow-black/20">
        <BookingReviewPanel summary={summary} />
      </BookingSectionCard>

      <TrustReinforcementCard />

      <PaymentPricingAccordion summary={summary} />

      <PaymentMethodCard footerTrust={false} />

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      {message ? <p className="text-sm text-zinc-600 dark:text-zinc-400">{message}</p> : null}

      <div className="hidden lg:block">
        <Button
          type="button"
          size="xl"
          className="h-14 w-full rounded-xl text-base font-semibold shadow-md shadow-blue-600/25 transition-all duration-200 hover:bg-blue-600/95 hover:shadow-lg hover:shadow-blue-600/30 active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100 dark:hover:bg-blue-500/95"
          disabled={primaryDisabled}
          onClick={() => void handlePay()}
        >
          {busy ? payCopy.payProcessing : payCopy.payCta}
        </Button>
      </div>

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 lg:hidden",
          "rounded-t-2xl border border-b-0 border-zinc-200/90 bg-white/98 shadow-[0_-8px_30px_rgba(0,0,0,0.08)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 dark:shadow-black/40",
        )}
      >
        <div className="flex flex-col gap-2 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <TrustReinforcementCard className="border-0 bg-transparent px-0 py-0 dark:bg-transparent" />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="h-11 w-full rounded-xl border-zinc-200 font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
            disabled={busy}
            onClick={onBack}
          >
            Back
          </Button>
          <Button
            type="button"
            size="xl"
            className="h-12 w-full rounded-xl text-[15px] font-semibold shadow-md shadow-blue-600/30 transition-all active:scale-[0.99] disabled:opacity-60"
            disabled={primaryDisabled}
            onClick={() => void handlePay()}
          >
            {busy ? payCopy.payProcessing : payCopy.payCta}
          </Button>
        </div>
      </div>

      <div className="h-[10.5rem] shrink-0 lg:hidden" aria-hidden />
    </div>
  );
}
