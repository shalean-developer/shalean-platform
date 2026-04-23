"use client";

/** Relative to the average slot price for the day (demand-based pricing, not a checkout discount). */
export type SlotDemandPriceBand = "best-value" | "peak" | "standard";

type TimeSlotCardProps = {
  time: string;
  /** Slot list price in ZAR; null while loading or if server did not attach pricing. */
  priceZar: number | null;
  /** How this slot’s price compares to the day’s average for the same job. */
  priceDemandBand?: SlotDemandPriceBand | null;
  selected: boolean;
  dimUnselected: boolean;
  onSelect: () => void;
  /** Assistant “balanced” pick — blue ring when not yet selected */
  assistantRecommended?: boolean;
  /** Badge text when `assistantRecommended` (conversion copy). */
  recommendedBadgeText?: string;
};

function DemandBandLabel({ band }: { band: SlotDemandPriceBand }) {
  if (band === "best-value") {
    return <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100">Best value</span>;
  }
  if (band === "peak") {
    return <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-semibold text-amber-900 dark:bg-amber-950/70 dark:text-amber-100">Peak time</span>;
  }
  return null;
}

export function TimeSlotCard({
  time,
  priceZar,
  priceDemandBand = null,
  selected,
  dimUnselected,
  onSelect,
  assistantRecommended = false,
  recommendedBadgeText = "Recommended for you",
}: TimeSlotCardProps) {
  const assistantHighlight = assistantRecommended && !selected;
  const topBadge = assistantRecommended ? (
    <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-semibold leading-tight text-blue-900 dark:bg-blue-950/80 dark:text-blue-100">
      {recommendedBadgeText}
    </span>
  ) : priceZar != null && priceDemandBand ? (
    <DemandBandLabel band={priceDemandBand} />
  ) : null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        "relative flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left",
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
      {topBadge ? (
        <div className="absolute -top-2 left-3">
          {topBadge}
        </div>
      ) : null}

      <span
        className={[
          "text-base font-medium tabular-nums text-zinc-900 dark:text-zinc-50",
          selected ? "text-primary" : assistantHighlight ? "text-blue-700 dark:text-blue-300" : "",
        ].join(" ")}
      >
        {time}
      </span>

      <div className="flex items-center justify-end">
        <p
          className={[
            "text-base font-semibold tabular-nums",
            selected ? "text-primary" : assistantHighlight ? "text-blue-700 dark:text-blue-300" : "text-zinc-900 dark:text-zinc-50",
          ].join(" ")}
        >
          {priceZar != null ? `R ${priceZar.toLocaleString("en-ZA")}` : "—"}
        </p>
      </div>
    </button>
  );
}
