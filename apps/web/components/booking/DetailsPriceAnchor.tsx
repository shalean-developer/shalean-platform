"use client";

import { cn } from "@/lib/utils";

type DetailsPriceAnchorProps = {
  hoursLine: string;
  priceLine: string;
  hoursCaption?: string;
  priceCaption?: string;
  footnote?: string;
  /** Hide footnote below `lg` (mobile blueprint: summary block only). */
  hideFootnoteBelowLg?: boolean;
  className?: string;
};

/**
 * High-contrast estimate block for the details step — blueprint “visual anchor” above the sticky CTA.
 */
export function DetailsPriceAnchor({
  hoursLine,
  priceLine,
  hoursCaption = "Est. hours",
  priceCaption = "Est. price",
  footnote,
  hideFootnoteBelowLg = false,
  className,
}: DetailsPriceAnchorProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div
        className="grid grid-cols-2 gap-3 rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 px-4 py-4 text-white shadow-md shadow-blue-900/20 sm:gap-4 sm:px-5 sm:py-5 dark:from-blue-600 dark:to-blue-800 dark:shadow-black/30"
        aria-live="polite"
      >
        <div className="min-w-0 border-r border-white/25 pr-3 sm:pr-4">
          <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{hoursLine}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-blue-100/95 sm:text-[11px]">
            {hoursCaption}
          </p>
        </div>
        <div className="min-w-0 pl-1">
          <p className="text-2xl font-bold tabular-nums tracking-tight sm:text-3xl">{priceLine}</p>
          <p className="mt-1 text-[10px] font-semibold uppercase tracking-wider text-blue-100/95 sm:text-[11px]">
            {priceCaption}
          </p>
        </div>
      </div>
      {footnote ? (
        <p
          className={cn(
            "text-center text-[11px] leading-snug text-zinc-500 dark:text-zinc-400",
            hideFootnoteBelowLg && "hidden lg:block",
          )}
        >
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
