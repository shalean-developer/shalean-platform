"use client";

import { cn } from "@/lib/utils";

function formatZar(n: number): string {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

type BottomCTAProps = {
  onBack: () => void;
  onNext: () => void;
  backDisabled?: boolean;
  nextDisabled?: boolean;
  /** When true, hides the primary / Continue control (e.g. step 1 before service is confirmed). */
  hideNext?: boolean;
  nextLabel?: string;
  backLabel?: string;
  total: number;
  priceLoading?: boolean;
  className?: string;
  /** Stack under a fixed mobile quote strip (no `position: fixed` on this root). */
  embedded?: boolean;
};

export function BottomCTA({
  onBack,
  onNext,
  backDisabled,
  nextDisabled,
  hideNext,
  nextLabel = "Continue",
  backLabel = "Back",
  total,
  priceLoading,
  className,
  embedded,
}: BottomCTAProps) {
  return (
    <div
      className={cn(
        embedded
          ? "relative z-auto w-full border-t border-gray-100 bg-white/95 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95"
          : "fixed bottom-0 left-0 right-0 z-50 border-t border-gray-100 bg-white pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-4px_24px_-8px_rgba(0,0,0,0.06)] dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 sm:px-6">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">Total</p>
          <p className="text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50" aria-live="polite">
            {priceLoading ? "…" : formatZar(total)}
          </p>
        </div>
        <div className={cn("flex gap-3", hideNext && "justify-stretch")}>
          <button
            type="button"
            onClick={onBack}
            disabled={backDisabled}
            className={cn(
              "min-h-14 rounded-xl border border-gray-200 bg-white py-3 text-sm font-semibold text-zinc-900 transition-all duration-200 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-40 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:border-zinc-500 dark:hover:bg-zinc-800/80",
              hideNext ? "w-full" : "flex-1",
            )}
          >
            {backLabel}
          </button>
          {hideNext ? null : (
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              className="min-h-14 flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white shadow-sm transition-all duration-200 hover:bg-blue-700 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {nextLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
