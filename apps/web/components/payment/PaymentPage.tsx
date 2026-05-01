"use client";

import { PriceBreakdown } from "@/components/payment/PriceBreakdown";
import { TipSelector } from "@/components/payment/TipSelector";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";

type PaymentPageProps = {
  summary: BookingPaymentSummary;
  tipZar: number;
  onTipZarChange: (zar: number) => void;
  coverOn: boolean;
  onCoverChange: (v: boolean) => void;
  walletOn: boolean;
  onWalletChange: (v: boolean) => void;
  busy: boolean;
  error: string | null;
  message: string | null;
  onPay: () => void;
  onBack: () => void;
  payDisabled: boolean;
};

function formatZar(n: number): string {
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
}

export function PaymentPage({
  summary,
  tipZar,
  onTipZarChange,
  coverOn,
  onCoverChange,
  walletOn,
  onWalletChange,
  busy,
  error,
  message,
  onPay,
  onBack,
  payDisabled,
}: PaymentPageProps) {
  const totalDue = summary.priceZar + tipZar;

  return (
    <div className="min-h-dvh bg-zinc-50 pb-36 sm:pb-10 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-[576px] space-y-6 px-4 py-8">
        <header className="text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-zinc-400">Shalean</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-gray-900 dark:text-zinc-50">Checkout</h1>
          <p className="mt-1 text-sm text-gray-600 dark:text-zinc-400">Review and pay securely.</p>
        </header>

        <TipSelector summary={summary} tipZar={tipZar} onTipZarChange={onTipZarChange} />

        <PriceBreakdown
          summary={summary}
          tipZar={tipZar}
          coverOn={coverOn}
          onCoverChange={onCoverChange}
          walletOn={walletOn}
          onWalletChange={onWalletChange}
        />

        <p className="text-center text-xs text-gray-500 dark:text-zinc-500">Secure payment powered by Paystack</p>

        {error ? <p className="text-center text-sm text-red-600 dark:text-red-400">{error}</p> : null}
        {message ? <p className="text-center text-sm text-gray-600 dark:text-zinc-400">{message}</p> : null}

        <div className="hidden gap-3 sm:flex sm:flex-row sm:items-stretch">
          <button
            type="button"
            onClick={onPay}
            disabled={payDisabled || busy}
            className="flex min-h-14 min-w-0 flex-1 items-center justify-center rounded-xl bg-blue-600 px-4 text-base font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Processing…" : "Pay & confirm"}
          </button>
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-14 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-800 transition hover:bg-gray-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Back
          </button>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-gray-200 bg-zinc-50/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 sm:hidden">
        <div className="mx-auto w-full max-w-[576px] space-y-2">
          <div className="flex items-center justify-between px-1 text-sm text-gray-600 dark:text-zinc-400">
            <span>Total due</span>
            <span className="text-base font-semibold tabular-nums text-gray-900 dark:text-zinc-50">{formatZar(totalDue)}</span>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onPay}
              disabled={payDisabled || busy}
              className="flex min-h-14 min-w-0 flex-1 items-center justify-center rounded-xl bg-blue-600 px-3 text-base font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Processing…" : "Pay & confirm"}
            </button>
            <button
              type="button"
              onClick={onBack}
              className="flex min-h-14 shrink-0 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
