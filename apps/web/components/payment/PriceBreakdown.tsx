"use client";

import { Info } from "lucide-react";
import type { BookingPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { formatPaymentBookingCostSubtitle } from "@/lib/payments/bookingPaymentSummary";
import { BlueToggle } from "@/components/payment/BlueToggle";
import { cn } from "@/lib/utils";

function formatZar(n: number): string {
  return `R ${Math.round(n).toLocaleString("en-ZA")}`;
}

function Row({
  label,
  sub,
  value,
  valueClassName,
}: {
  label: React.ReactNode;
  sub?: string;
  value: number;
  valueClassName?: string;
}) {
  return (
    <div className="flex justify-between gap-3 text-sm">
      <div className="min-w-0">
        <div className="font-medium text-gray-900 dark:text-zinc-100">{label}</div>
        {sub ? <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">{sub}</p> : null}
      </div>
      <span className={cn("shrink-0 text-right font-medium tabular-nums text-gray-900 dark:text-zinc-100", valueClassName)}>
        {formatZar(value)}
      </span>
    </div>
  );
}

type PriceBreakdownProps = {
  summary: BookingPaymentSummary;
  tipZar: number;
  coverOn: boolean;
  onCoverChange: (v: boolean) => void;
  walletOn: boolean;
  onWalletChange: (v: boolean) => void;
};

export function PriceBreakdown({
  summary,
  tipZar,
  coverOn,
  onCoverChange,
  walletOn,
  onWalletChange,
}: PriceBreakdownProps) {
  const subtitle = formatPaymentBookingCostSubtitle(summary);
  const totalDue = summary.priceZar + tipZar;

  return (
    <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h2 className="text-base font-semibold text-gray-900 dark:text-zinc-50">Price Breakdown</h2>

      <Row
        label="Booking cost"
        sub={subtitle || undefined}
        value={summary.bookingCoreZar}
      />

      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-zinc-100">
          <span>Other costs</span>
          <span className="inline-flex text-gray-400 dark:text-zinc-500" title="Add-ons, protection, and platform fees.">
            <Info className="h-4 w-4" aria-hidden />
          </span>
        </div>
        {summary.extrasTotalZar > 0 ? (
          <div className="flex justify-between gap-3 pl-2 text-sm text-gray-700 dark:text-zinc-300">
            <span>Add-ons</span>
            <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-zinc-100">
              {formatZar(summary.extrasTotalZar)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between gap-3 pl-2 text-sm text-gray-700 dark:text-zinc-300">
          <span>Service fee</span>
          <span className="shrink-0 tabular-nums font-medium text-gray-900 dark:text-zinc-100">
            {formatZar(summary.serviceFeeZar)}
          </span>
        </div>
      </div>

      <div className="my-2 border-t border-gray-200 dark:border-zinc-700" />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">Booking cover</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">Complimentary when enabled — no extra charge.</p>
        </div>
        <BlueToggle checked={coverOn} onCheckedChange={onCoverChange} aria-label="Booking cover" />
      </div>

      <div className="my-2 border-t border-gray-200 dark:border-zinc-700" />

      <div className="flex justify-between gap-3 text-sm font-semibold text-gray-900 dark:text-zinc-50">
        <span>Booking total</span>
        <span className="tabular-nums">{formatZar(summary.priceZar)}</span>
      </div>

      <div className="flex items-center justify-between gap-3 opacity-60">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-zinc-100">Wallet</p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">Coming soon</p>
        </div>
        <BlueToggle checked={walletOn} onCheckedChange={onWalletChange} disabled aria-label="Wallet (coming soon)" />
      </div>

      <div className="my-2 border-t border-gray-200 pt-2 dark:border-zinc-700" />

      <div className="flex justify-between gap-3 text-lg font-semibold text-gray-900 dark:text-zinc-50">
        <span>Total due</span>
        <span className="text-right tabular-nums">{formatZar(totalDue)}</span>
      </div>
    </div>
  );
}
