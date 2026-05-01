"use client";

import { Button } from "@/components/ui/button";

function formatZar(n: number): string {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

type Props = {
  total: number;
  loading?: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
};

export function MobilePriceBar({ total, loading, primaryLabel, onPrimary, primaryDisabled }: Props) {
  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-zinc-200 bg-white/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95 lg:hidden"
      role="region"
      aria-label="Booking total and continue"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Total</p>
          <p className="truncate text-lg font-semibold tabular-nums text-zinc-900 dark:text-zinc-50" aria-live="polite">
            {loading ? "…" : formatZar(total)}
          </p>
        </div>
        <Button
          type="button"
          size="lg"
          className="h-11 shrink-0 rounded-lg px-5"
          onClick={onPrimary}
          disabled={Boolean(primaryDisabled || loading)}
          aria-label={primaryLabel}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
