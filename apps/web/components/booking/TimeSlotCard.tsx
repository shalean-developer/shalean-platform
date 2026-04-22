"use client";

import { Flame } from "lucide-react";

/** Relative to the average slot price for the day (demand-based pricing, not a checkout discount). */
export type SlotDemandPriceBand = "best-value" | "peak" | "standard";

type TimeSlotCardProps = {
  time: string;
  /** Slot list price in ZAR; null while loading or if server did not attach pricing. */
  priceZar: number | null;
  /** How this slot’s price compares to the day’s average for the same job. */
  priceDemandBand?: SlotDemandPriceBand | null;
  durationLabel: string;
  selected: boolean;
  dimUnselected: boolean;
  onSelect: () => void;
  /** Assistant “balanced” pick — blue ring when not yet selected */
  assistantRecommended?: boolean;
  /** Badge text when `assistantRecommended` (conversion copy). */
  recommendedBadgeText?: string;
  showFillsFastBadge?: boolean;
  availabilityHint?: string | null;
};

function DemandBandLabel({ band }: { band: SlotDemandPriceBand }) {
  if (band === "best-value") {
    return <span className="text-xs font-medium text-green-600 dark:text-green-400">💚 Best value</span>;
  }
  if (band === "peak") {
    return <span className="text-xs font-medium text-orange-500 dark:text-orange-400">🔥 Peak time</span>;
  }
  return <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">Standard time</span>;
}

export function TimeSlotCard({
  time,
  priceZar,
  priceDemandBand = null,
  durationLabel,
  selected,
  dimUnselected,
  onSelect,
  assistantRecommended = false,
  recommendedBadgeText = "Recommended for you",
  showFillsFastBadge = false,
  availabilityHint = null,
}: TimeSlotCardProps) {
  const assistantHighlight = assistantRecommended && !selected;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "flex w-full flex-col rounded-xl border p-4 text-left",
        "transition-[transform,box-shadow,border-color,background-color,opacity] duration-200 ease-out",
        "will-change-transform motion-reduce:transition-colors motion-reduce:transform-none",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
        "active:scale-[0.97] motion-reduce:active:scale-100",
        selected
          ? [
              "z-[1] scale-[1.02] border-primary bg-primary/5 shadow-xl shadow-primary/10",
              "ring-1 ring-primary/20 motion-reduce:scale-100",
            ].join(" ")
          : assistantHighlight
            ? [
                "z-[1] scale-[1.02] border-sky-500 bg-sky-50/90 shadow-md shadow-sky-500/10",
                "ring-2 ring-sky-500/50 dark:border-sky-600 dark:bg-sky-950/40 dark:ring-sky-500/40",
              ].join(" ")
            : [
                "border-zinc-200/90 bg-white dark:border-zinc-700 dark:bg-zinc-950",
                "hover:-translate-y-0.5 hover:border-primary/70 hover:shadow-md",
                dimUnselected
                  ? "opacity-60 hover:opacity-95"
                  : "hover:scale-[1.01] motion-reduce:hover:scale-100",
              ].join(" "),
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-medium tabular-nums text-zinc-600 dark:text-zinc-400">{time}</span>
        {assistantRecommended ? (
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold leading-tight text-sky-900 dark:bg-sky-950/80 dark:text-sky-100">
            {recommendedBadgeText}
          </span>
        ) : null}
      </div>

      <div className="mt-1 flex flex-wrap items-end justify-between gap-x-2 gap-y-1">
        <div className="min-w-0 flex-1 space-y-1">
          <p
            className={[
              "text-2xl font-bold tabular-nums tracking-tight",
              selected ? "text-primary" : assistantHighlight ? "text-sky-700 dark:text-sky-300" : "text-emerald-600 dark:text-emerald-400",
            ].join(" ")}
          >
            {priceZar != null ? `R ${priceZar.toLocaleString("en-ZA")}` : "—"}
          </p>
          {priceZar != null && priceDemandBand ? <DemandBandLabel band={priceDemandBand} /> : null}
        </div>
      </div>

      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{durationLabel}</p>
      {availabilityHint ? (
        <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">{availabilityHint}</p>
      ) : null}

      {showFillsFastBadge ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
            <Flame className="h-3 w-3 shrink-0" aria-hidden />
            Fills fast
          </span>
        </div>
      ) : null}
    </button>
  );
}
