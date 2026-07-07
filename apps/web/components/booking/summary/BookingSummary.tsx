"use client";

import Link from "next/link";
import { memo, useCallback, useMemo, useState } from "react";
import { CheckCircle2, ChevronUp, Info, Lock, Shield } from "lucide-react";
import type { SelectedExtraRow } from "@/components/booking/BookingSelectedExtrasList";
import { BookingSelectionProgressDialog } from "@/components/booking/summary/BookingSelectionProgressDialog";
import { DetailRow } from "@/components/booking/summary/DetailRow";
import { SummaryBlock } from "@/components/booking/summary/SummaryBlock";
import { VoucherInput } from "@/components/booking/summary/VoucherInput";
import type { CheckoutSummaryStep } from "@/lib/booking/checkoutSidebarPricing";
import { bookingCopy } from "@/lib/booking/copy";
import { cn } from "@/lib/utils";

const paymentSidebarCopy = bookingCopy.checkoutPayment;

function formatSidebarHoursLine(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  const x = Math.round(h * 10) / 10;
  const s = Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, "");
  return `${s} hrs`;
}

function formatSidebarDateLine(date: string | null): string {
  const d = date?.trim() ?? "";
  if (!d) return "—";
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" });
}

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
  /** Sidebar price label (EST. PRICE / BOOKING PRICE / TOTAL). */
  priceLabel: string;
  /** Optional note when slot-aware pricing applies. */
  priceFootnote?: string;
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
  /** Desktop checkout: stress the When row (date & time). */
  highlightWhenRow?: boolean;
  /** Subtle trust line below the card body (e.g. schedule / cleaner). */
  sidebarTrustLine?: string;
  /** Step 2 desktop: two-card blueprint (summary rows + separate trust card). */
  scheduleDesktopSidebar?: boolean;
  /** Step 4 desktop: compact summary + dual trust lines (payment step). */
  paymentDesktopSidebar?: boolean;
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
  priceLabel,
  priceFootnote,
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
  highlightWhenRow = false,
  sidebarTrustLine,
  scheduleDesktopSidebar = false,
  paymentDesktopSidebar = false,
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
            priceLabel={priceLabel}
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
    [checkoutStep, summaryHours, summaryTotalZar, priceLabel, loading],
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

  if (paymentDesktopSidebar) {
    const priceLine = loading ? "…" : `R${Math.round(summaryTotalZar).toLocaleString("en-ZA")}`;
    const dateLine = formatSidebarDateLine(bookingDate);
    const timeLine = bookingTime?.trim() ? bookingTime.trim() : "—";
    const cleanerShort = cleanerId ? paymentSidebarCopy.cleanerSelectedShort : paymentSidebarCopy.cleanerSidebar;
    const extrasLine =
      extrasRows.length === 0
        ? paymentSidebarCopy.extrasNone
        : extrasRows.length > 2
          ? paymentSidebarCopy.extrasSelected(extrasRows.length)
          : extrasRows.map((r) => r.label).join(", ");

    const rowStatic = "flex items-start justify-between gap-3 py-2.5 text-sm";
    const labelCls = "shrink-0 text-gray-500 dark:text-zinc-400";
    const valueCls = "min-w-0 max-w-[62%] text-right font-semibold text-gray-900 dark:text-zinc-50";

    return (
      <div className={cn("space-y-4", className)}>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/20">
          <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-zinc-50">Booking summary</h2>
          <div className="mt-2 divide-y divide-gray-100 dark:divide-zinc-800">
            <div className={rowStatic}>
              <span className={labelCls}>Service</span>
              <span className={valueCls}>{whatLabel}</span>
            </div>
            <div className={rowStatic}>
              <span className={labelCls}>When</span>
              <span className={valueCls}>
                {dateLine} · {timeLine}
              </span>
            </div>
            <div className={rowStatic}>
              <span className={labelCls}>Where</span>
              <span className={cn(valueCls, "whitespace-pre-wrap break-words")}>{whereLabel}</span>
            </div>
            <div className={rowStatic}>
              <span className={labelCls}>Cleaner</span>
              <span className={valueCls}>{cleanerShort}</span>
            </div>
            <div className={rowStatic}>
              <span className={labelCls}>Extras</span>
              <span className={valueCls}>{extrasLine}</span>
            </div>
            <div className={cn(rowStatic, "border-t border-gray-100 pt-3 dark:border-zinc-800")}>
              <span className={cn(labelCls, "font-medium text-gray-700 dark:text-zinc-300")}>Total</span>
              <span className={cn(valueCls, "text-base tabular-nums")}>{priceLine}</span>
            </div>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/20">
          <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-200/95">
            <Shield className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {paymentSidebarCopy.trustSecure}
          </div>
          <div className="flex items-center gap-2.5 text-sm font-medium text-emerald-800 dark:text-emerald-200/95">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
            {paymentSidebarCopy.trustNoFees}
          </div>
        </div>
      </div>
    );
  }

  if (scheduleDesktopSidebar) {
    const dateLine = formatSidebarDateLine(bookingDate);
    const timeLine = bookingTime?.trim() ? bookingTime.trim() : "—";
    const hoursLine = loading ? "…" : formatSidebarHoursLine(summaryHours);
    const priceLine = loading ? "…" : `R${Math.round(summaryTotalZar).toLocaleString("en-ZA")}`;

    const rowClasses =
      "flex items-start justify-between gap-4 rounded-xl px-0.5 py-3 transition-colors hover:bg-gray-50/80 dark:hover:bg-zinc-800/40";

    return (
      <div className={cn("space-y-4", className)}>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/20">
          <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-zinc-50">Booking summary</h2>
          <div className="mt-1 divide-y divide-gray-100 dark:divide-zinc-800">
            <Link href={editWhatHref} className={rowClasses} aria-label="Edit service">
              <span className="shrink-0 text-sm text-gray-500 dark:text-zinc-400">Service</span>
              <span className="min-w-0 max-w-[58%] text-right text-sm font-semibold text-gray-900 dark:text-zinc-50">
                {whatLabel}
              </span>
            </Link>
            <Link href={editWhenHref} className={rowClasses} aria-label="Edit date and time">
              <span className="shrink-0 text-sm text-gray-500 dark:text-zinc-400">When</span>
              <div className="min-w-0 max-w-[58%] text-right">
                <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">{dateLine}</p>
                <p className="mt-0.5 text-sm font-semibold text-gray-900 dark:text-zinc-50">{timeLine}</p>
              </div>
            </Link>
            <Link href={editWhereHref} className={rowClasses} aria-label="Edit location">
              <span className="shrink-0 text-sm text-gray-500 dark:text-zinc-400">Where</span>
              <span className="min-w-0 max-w-[58%] whitespace-pre-wrap break-words text-right text-sm font-semibold text-gray-900 dark:text-zinc-50">
                {whereLabel}
              </span>
            </Link>
            <Link href={editWhatHref} className={rowClasses} aria-label="Edit home details for estimate">
              <span className="shrink-0 text-sm text-gray-500 dark:text-zinc-400">Est. hours</span>
              <span className="min-w-0 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-zinc-50">
                {hoursLine}
              </span>
            </Link>
            <Link href={editWhenHref} className={rowClasses} aria-label="Edit schedule for price estimate">
              <span className="shrink-0 text-sm text-gray-500 dark:text-zinc-400">Est. price</span>
              <span className="min-w-0 text-right text-sm font-semibold tabular-nums text-gray-900 dark:text-zinc-50">
                {priceLine}
              </span>
            </Link>
          </div>
        </div>

        {sidebarTrustLine ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-5 py-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:shadow-black/20">
            <div className="flex items-center justify-center gap-2">
              <Lock className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{sidebarTrustLine}</span>
            </div>
          </div>
        ) : null}
      </div>
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
        <DetailRow
          label="When"
          value={whenLabel}
          editHref={editWhenHref}
          valueEmphasis={highlightWhenRow}
        />
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
          priceLabel={priceLabel}
          loading={loading}
        />
      </div>

      {priceFootnote ? (
        <p className="text-xs leading-snug text-zinc-500 dark:text-zinc-400">{priceFootnote}</p>
      ) : null}

      {sidebarTrustLine ? (
        <div className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-100/90 bg-emerald-50/60 py-2.5 dark:border-emerald-900/45 dark:bg-emerald-950/25">
          <Lock className="h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <span className="text-xs font-medium text-emerald-900 dark:text-emerald-100/90">{sidebarTrustLine}</span>
        </div>
      ) : null}

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
