"use client";

import { BadgeDollarSign, Flame, Sparkles, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { SlotLabelKind } from "@/lib/booking/slotLabels";

export type { SlotLabelKind };

const LABEL_META: Record<
  SlotLabelKind,
  { Icon: LucideIcon; text: string; className: string }
> = {
  "best-value": {
    Icon: BadgeDollarSign,
    text: "💰 Best value today",
    className: "text-emerald-700 dark:text-emerald-400/90",
  },
  "high-demand": {
    Icon: Flame,
    text: "🔥 High demand",
    className: "text-rose-700 dark:text-rose-400/90",
  },
  recommended: {
    Icon: Sparkles,
    text: "⭐ Balanced slot",
    className: "text-primary",
  },
  "almost-full": {
    Icon: Flame,
    text: "Only 2 slots left",
    className: "text-amber-700 dark:text-amber-400/90",
  },
  "most-booked": {
    Icon: Users,
    text: "Most customers choose this",
    className: "text-primary",
  },
};

type TimeSlotCardProps = {
  time: string;
  priceZar: number;
  /** Strikethrough “was” price (e.g. peak in this view) */
  compareAtZar?: number | null;
  savingsZar?: number | null;
  durationLabel: string;
  slotLabel: SlotLabelKind | null;
  selected: boolean;
  dimUnselected: boolean;
  onSelect: () => void;
  /** Assistant “balanced” pick — blue ring when not yet selected */
  assistantRecommended?: boolean;
  /** Badge text when `assistantRecommended` (conversion copy). */
  recommendedBadgeText?: string;
  showMostPopularBadge?: boolean;
  showFillsFastBadge?: boolean;
};

export function TimeSlotCard({
  time,
  priceZar,
  compareAtZar,
  savingsZar,
  durationLabel,
  slotLabel,
  selected,
  dimUnselected,
  onSelect,
  assistantRecommended = false,
  recommendedBadgeText = "Recommended for you",
  showMostPopularBadge = false,
  showFillsFastBadge = false,
}: TimeSlotCardProps) {
  const labelRow = slotLabel ? LABEL_META[slotLabel] : null;
  const showSavings = savingsZar != null && savingsZar > 0;
  const showCompare = compareAtZar != null && compareAtZar > priceZar;

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
        <div className="min-w-0 flex-1">
          <p
            className={[
              "text-2xl font-bold tabular-nums tracking-tight",
              selected ? "text-primary" : assistantHighlight ? "text-sky-700 dark:text-sky-300" : "text-emerald-600 dark:text-emerald-400",
            ].join(" ")}
          >
            R {priceZar.toLocaleString("en-ZA")}
          </p>
          {showCompare ? (
            <p className="text-sm tabular-nums text-zinc-400 line-through dark:text-zinc-500">
              R {compareAtZar!.toLocaleString("en-ZA")}
            </p>
          ) : null}
        </div>
      </div>

      {showSavings ? (
        <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400/90">
          Save R {Math.round(savingsZar!).toLocaleString("en-ZA")} vs peak today
        </p>
      ) : null}

      <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">{durationLabel}</p>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {showMostPopularBadge ? (
          <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-[10px] font-semibold text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
            Most popular
          </span>
        ) : null}
        {showFillsFastBadge ? (
          <span className="rounded-md bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
            Fills fast
          </span>
        ) : null}
      </div>

      {labelRow ? (
        <div
          className={[
            "mt-2 flex items-center gap-1.5 text-xs font-medium",
            labelRow.className,
          ].join(" ")}
        >
          <labelRow.Icon className="h-3.5 w-3.5 shrink-0 stroke-[1.75]" aria-hidden />
          <span>{labelRow.text}</span>
        </div>
      ) : null}
    </button>
  );
}
