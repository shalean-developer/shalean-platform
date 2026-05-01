"use client";

import { memo, useEffect, useRef, useState } from "react";
import { checkoutSummaryPriceLabel, type CheckoutSummaryStep } from "@/lib/booking/checkoutSidebarPricing";
import { cn } from "@/lib/utils";

function formatHoursLine(h: number): string {
  if (!Number.isFinite(h) || h <= 0) return "—";
  const x = Math.round(h * 10) / 10;
  const s = Number.isInteger(x) ? String(x) : x.toFixed(1).replace(/\.0$/, "");
  return `${s} hrs`;
}

export type SummaryBlockProps = {
  checkoutStep: CheckoutSummaryStep;
  hours: number;
  totalZar: number;
  loading?: boolean;
  className?: string;
  /** Tighter padding for the mobile dock strip */
  compact?: boolean;
};

function SummaryBlockInner({
  checkoutStep,
  hours,
  totalZar,
  loading,
  className,
  compact,
}: SummaryBlockProps) {
  const label = checkoutSummaryPriceLabel(checkoutStep);
  const prev = useRef({ hours, totalZar });
  const [tick, setTick] = useState(false);

  useEffect(() => {
    const h = prev.current.hours !== hours;
    const t = prev.current.totalZar !== totalZar;
    prev.current = { hours, totalZar };
    if (!h && !t) return;
    setTick(true);
    const id = window.setTimeout(() => setTick(false), 320);
    return () => window.clearTimeout(id);
  }, [hours, totalZar]);

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-2xl bg-blue-600 text-white transition-all duration-300 dark:bg-blue-600",
        compact ? "px-4 py-3" : "px-5 py-4",
        tick ? "scale-[1.02] shadow-sm shadow-blue-900/20 ring-1 ring-white/25" : "scale-100",
        className,
      )}
      aria-live="polite"
    >
      <div
        className={cn(
          "min-w-0 transition-opacity duration-300",
          tick && "opacity-90",
        )}
      >
        <p
          className={cn(
            "font-semibold tabular-nums tracking-tight transition-transform duration-300",
            compact ? "text-base" : "text-lg",
          )}
        >
          {loading ? "…" : formatHoursLine(hours)}
        </p>
        <p className={cn("opacity-80", compact ? "text-[10px]" : "text-xs")}>EST. HOURS</p>
      </div>
      <div
        className={cn(
          "text-right transition-opacity duration-300",
          tick && "opacity-90",
        )}
      >
        <p
          className={cn(
            "font-semibold tabular-nums tracking-tight transition-transform duration-300",
            compact ? "text-base" : "text-lg",
          )}
        >
          {loading ? "…" : `R${Math.round(totalZar).toLocaleString("en-ZA")}`}
        </p>
        <p className={cn("opacity-80", compact ? "text-[10px]" : "text-xs")}>{label}</p>
      </div>
    </div>
  );
}

export const SummaryBlock = memo(SummaryBlockInner);
