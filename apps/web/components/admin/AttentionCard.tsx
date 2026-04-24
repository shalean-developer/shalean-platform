"use client";

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type AttentionSeverity = "normal" | "warning" | "critical";

export type AttentionCardProps = {
  title: string;
  count: number;
  severity: AttentionSeverity;
  viewHref: string;
  assignHref: string;
  /** Primary line under the count. */
  detailLine?: string | null;
  /** Extra bullet lines (e.g. SLA bucket counts). */
  secondaryLines?: string[];
  /** Native tooltip (e.g. “Pending since: …”). */
  detailTooltip?: string | null;
  /** SLA card when breaches > 0 — stronger ring / scale. */
  emphasized?: boolean;
  /** Short pulse + ring draw attention (e.g. SLA block). */
  pulseHighlight?: boolean;
  /** Queue delta vs previous poll, e.g. “(↑ from 1)”. */
  trendHint?: string | null;
  /** Primary row = larger typography; secondary = compact. */
  tier?: "primary" | "secondary";
};

const severityStyles: Record<
  AttentionSeverity,
  { border: string; ring: string; number: string; label: string; hover: string }
> = {
  normal: {
    border: "border-l-4 border-l-sky-500",
    ring: "focus-within:ring-sky-500/30",
    number: "text-sky-900 dark:text-sky-100",
    label: "text-sky-800/80 dark:text-sky-200/90",
    hover: "hover:border-sky-300 dark:hover:border-sky-700",
  },
  warning: {
    border: "border-l-4 border-l-amber-500",
    ring: "focus-within:ring-amber-500/30",
    number: "text-amber-950 dark:text-amber-50",
    label: "text-amber-900/80 dark:text-amber-100/85",
    hover: "hover:border-amber-300 dark:hover:border-amber-800",
  },
  critical: {
    border: "border-l-4 border-l-red-600",
    ring: "focus-within:ring-red-500/30",
    number: "text-red-950 dark:text-red-50",
    label: "text-red-900/85 dark:text-red-100/85",
    hover: "hover:border-red-300 dark:hover:border-red-900",
  },
};

export function AttentionCard({
  title,
  count,
  severity,
  viewHref,
  assignHref,
  detailLine,
  secondaryLines,
  detailTooltip,
  emphasized = false,
  pulseHighlight = false,
  trendHint,
  tier = "primary",
}: AttentionCardProps) {
  const s = severityStyles[severity];
  const isClear = count === 0;
  const countClass = tier === "primary" ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl";

  return (
    <div
      className={cn(
        "rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm transition dark:border-zinc-800 dark:bg-zinc-900/90",
        s.border,
        s.hover,
        "hover:-translate-y-0.5 hover:shadow-md",
        "focus-within:ring-2",
        s.ring,
        emphasized && "ring-2 ring-red-500/55 shadow-md dark:ring-red-500/40",
        pulseHighlight && "motion-safe:animate-pulse motion-reduce:animate-none",
        tier === "primary" ? "p-4 sm:p-5" : "p-3.5 sm:p-4",
      )}
    >
      {isClear ? (
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{title}</p>
              {trendHint ? (
                <span className="text-[10px] font-semibold tabular-nums text-zinc-400 dark:text-zinc-500">{trendHint}</span>
              ) : null}
            </div>
            <p className={cn("mt-1 font-semibold tabular-nums text-zinc-400 dark:text-zinc-500", countClass)}>0</p>
            <p className="mt-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">All clear in this queue</p>
            <div className="mt-3">
              <Button variant="outline" size="sm" className="w-full sm:w-auto" asChild>
                <Link href={viewHref}>View</Link>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <p className={cn("text-xs font-semibold uppercase tracking-wide", s.label)}>{title}</p>
            {trendHint ? (
              <span className="text-[10px] font-semibold tabular-nums text-zinc-500 dark:text-zinc-400">{trendHint}</span>
            ) : null}
          </div>
          <p className={cn("mt-1 font-semibold tabular-nums", s.number, countClass)}>{count}</p>
          <div title={detailTooltip ?? undefined}>
            {detailLine ? (
              <p className="mt-1 text-xs font-medium text-zinc-600 dark:text-zinc-300">{detailLine}</p>
            ) : (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">Needs action</p>
            )}
            {secondaryLines && secondaryLines.length > 0 ? (
              <ul className="mt-1.5 space-y-0.5 text-[11px] font-medium tabular-nums text-zinc-600 dark:text-zinc-300">
                {secondaryLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={viewHref}>View</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href={assignHref}>Assign now</Link>
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
