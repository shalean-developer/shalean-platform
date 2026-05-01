"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { ChevronUp, Info } from "lucide-react";
import type { SelectedExtraRow } from "@/components/booking/BookingSelectedExtrasList";
import { BookingSelectionProgressDialog } from "@/components/booking/summary/BookingSelectionProgressDialog";
import { DetailRow } from "@/components/booking/summary/DetailRow";
import { SummaryBlock } from "@/components/booking/summary/SummaryBlock";
import { VoucherInput } from "@/components/booking/summary/VoucherInput";
import type { CheckoutSummaryStep } from "@/lib/booking/checkoutSidebarPricing";
import { cn } from "@/lib/utils";

export type BookingSummaryProps = {
  whereLabel: string;
  whatLabel: string;
  whenLabel: string;
  editWhereHref: string;
  editWhatHref: string;
  editWhenHref: string;
  checkoutStep: CheckoutSummaryStep;
  summaryHours: number;
  summaryTotalZar: number;
  extrasRows: SelectedExtraRow[];
  onRemoveExtra?: (id: string) => void;
  loading?: boolean;
  onVoucherApply?: (code: string) => void | Promise<void>;
  className?: string;
  bedrooms: number;
  bathrooms: number;
  extraRooms: number;
  bookingDate: string | null;
  bookingTime: string | null;
  cleanerId: string | null;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  /** Mobile-only: thin dock row; opens full sheet via `onMobileDockOpen`. */
  layoutMode?: "default" | "mobile-dock-compact";
  onMobileDockOpen?: () => void;
  /** Omit the “Booking summary” title + subtitle (e.g. payment page already has “Quote”). */
  hideSummaryHeading?: boolean;
};

function BookingSummaryInner({
  whereLabel,
  whatLabel,
  whenLabel,
  editWhereHref,
  editWhatHref,
  editWhenHref,
  checkoutStep,
  summaryHours,
  summaryTotalZar,
  extrasRows,
  onRemoveExtra,
  loading,
  onVoucherApply,
  className,
  bedrooms,
  bathrooms,
  extraRooms,
  bookingDate,
  bookingTime,
  cleanerId,
  customerName,
  customerEmail,
  customerPhone,
  layoutMode = "default",
  onMobileDockOpen,
  hideSummaryHeading = false,
}: BookingSummaryProps) {
  const extrasCount = extrasRows.length;
  const [selectionInfoOpen, setSelectionInfoOpen] = useState(false);
  const showExtrasCollapsed = extrasCount > 3;

  const onDockClick = useCallback(() => {
    onMobileDockOpen?.();
  }, [onMobileDockOpen]);

  const dockBody = useMemo(
    () => (
      <div className="flex w-full min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          <SummaryBlock
            checkoutStep={checkoutStep}
            hours={summaryHours}
            totalZar={summaryTotalZar}
            loading={loading}
            compact
          />
        </div>
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
          Full quote
        </span>
        <ChevronUp className="h-4 w-4 shrink-0 text-gray-400 transition-opacity group-hover:opacity-80 dark:text-zinc-500" aria-hidden />
      </div>
    ),
    [checkoutStep, summaryHours, summaryTotalZar, loading],
  );

  if (layoutMode === "mobile-dock-compact") {
    return (
      <button
        type="button"
        onClick={onDockClick}
        className="group flex w-full min-w-0 items-center text-left transition active:scale-[0.99]"
        aria-label="View full quote"
        suppressHydrationWarning
      >
        {dockBody}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/95 dark:backdrop-blur-sm",
        className,
      )}
    >
      {hideSummaryHeading ? null : (
        <div>
          <h2 className="text-sm font-semibold tracking-wide text-gray-800 dark:text-zinc-100">Booking summary</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-zinc-400">Updates as you adjust your visit.</p>
        </div>
      )}

      <div className="space-y-1">
        <DetailRow label="Where" value={whereLabel} editHref={editWhereHref} />
        <DetailRow label="What" value={whatLabel} editHref={editWhatHref} />
        <DetailRow label="When" value={whenLabel} editHref={editWhenHref} />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
            Extras ({extrasCount} selected)
          </h3>
          <button
            type="button"
            onClick={() => setSelectionInfoOpen(true)}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-all hover:bg-gray-100 hover:text-blue-600 active:scale-95 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-blue-400"
            aria-label="View your selection by step"
            suppressHydrationWarning
          >
            <Info className="h-4 w-4 opacity-80 transition-opacity hover:opacity-100" aria-hidden />
          </button>
        </div>
        {extrasCount === 0 ? (
          <p className="text-sm text-gray-400 dark:text-zinc-500">No extras selected</p>
        ) : showExtrasCollapsed ? (
          <div className="rounded-xl border border-gray-200/80 bg-gray-50/80 px-3 py-3 text-center dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="text-sm font-semibold text-gray-900 dark:text-zinc-100">
              {extrasCount} extra{extrasCount === 1 ? "" : "s"} selected
            </p>
            <p className="mt-2 text-[11px] leading-snug text-gray-500 dark:text-zinc-400">
              Tap <span className="font-medium text-gray-700 dark:text-zinc-300">info</span> to see each add-on, or go
              back to{" "}
              <span className="font-medium text-blue-600 dark:text-blue-400">Your home & service</span> to edit.
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 items-start gap-1.5">
            {extrasRows.map((row) => (
              <li key={row.id} className="min-w-0">
                <div className="flex w-full items-start gap-1 rounded-lg border border-gray-200/90 bg-white/90 px-1.5 py-1 dark:border-zinc-700 dark:bg-zinc-900/80">
                  <p className="line-clamp-2 min-w-0 flex-1 text-[11px] font-semibold leading-tight text-gray-900 dark:text-zinc-100">
                    <span>{row.label}</span>
                    {row.priceZar != null && Number.isFinite(row.priceZar) ? (
                      <span className="whitespace-nowrap tabular-nums text-gray-600 dark:text-zinc-400">
                        {" · R"}
                        {Math.round(row.priceZar).toLocaleString("en-ZA")}
                      </span>
                    ) : null}
                  </p>
                  {onRemoveExtra ? (
                    <button
                      type="button"
                      aria-label={`Remove ${row.label}`}
                      onClick={() => onRemoveExtra(row.id)}
                      className="-mr-0.5 -mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded text-xs leading-none text-gray-400 transition-all hover:bg-gray-100 hover:text-gray-800 active:scale-95 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                      suppressHydrationWarning
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="transition-all duration-300">
        <SummaryBlock
          checkoutStep={checkoutStep}
          hours={summaryHours}
          totalZar={summaryTotalZar}
          loading={loading}
        />
      </div>

      <VoucherInput onApply={onVoucherApply} disabled={loading} />

      <BookingSelectionProgressDialog
        open={selectionInfoOpen}
        onOpenChange={setSelectionInfoOpen}
        checkoutStep={checkoutStep}
        whatLabel={whatLabel}
        bedrooms={bedrooms}
        bathrooms={bathrooms}
        extraRooms={extraRooms}
        extrasRows={extrasRows}
        whereLabel={whereLabel}
        bookingDate={bookingDate}
        bookingTime={bookingTime}
        cleanerId={cleanerId}
        customerName={customerName}
        customerEmail={customerEmail}
        customerPhone={customerPhone}
      />
    </div>
  );
}

export const BookingSummary = memo(BookingSummaryInner);
