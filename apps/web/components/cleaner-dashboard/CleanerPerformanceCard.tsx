"use client";

import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { CleanerDashboardInfoHint } from "./CleanerDashboardInfoHint";
import { cn } from "@/lib/utils";

export type CleanerPerformanceMetrics = {
  jobsCompleted: number | null;
  rating: number | null;
  completionPct: number | null;
};

function dash(n: number | null, format: (v: number) => string): string {
  return n == null ? "—" : format(n);
}

/** Compact stats row — use inside merged availability card or standalone card body. */
export function CleanerPerformanceStatsRow({
  metrics,
  compact,
}: {
  metrics: CleanerPerformanceMetrics;
  compact?: boolean;
}) {
  const { jobsCompleted, rating, completionPct } = metrics;

  const ratingText = useMemo(() => {
    if (rating == null) return "—";
    const rounded = Math.round(rating * 10) / 10;
    return `${rounded.toFixed(1)} ★`;
  }, [rating]);

  const ratingClass = useMemo(() => {
    if (rating == null) return "text-foreground";
    if (rating >= 4.5) return "text-emerald-600 dark:text-emerald-400";
    if (rating < 4.0) return "text-red-600 dark:text-red-400";
    return "text-foreground";
  }, [rating]);

  const val = compact ? "text-base font-semibold tabular-nums" : "text-lg font-semibold tabular-nums";
  const lab = compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground";

  return (
    <div className={cn("grid grid-cols-3 gap-2 text-center sm:text-left", compact && "gap-3")}>
      <div>
        <p className={lab}>Jobs</p>
        <p className={cn(val, "text-foreground")}>{dash(jobsCompleted, (v) => String(v))}</p>
      </div>
      <div>
        <p className={lab}>Rating</p>
        <p className={cn(val, ratingClass)}>{ratingText}</p>
      </div>
      <div>
        <p className={lab}>Completion</p>
        <p className={cn(val, "text-foreground")}>{dash(completionPct, (v) => `${v}%`)}</p>
      </div>
    </div>
  );
}

export function CleanerPerformanceCard({ metrics }: { metrics: CleanerPerformanceMetrics }) {
  return (
    <Card className="rounded-2xl border border-border p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <h3 className="text-base font-semibold text-foreground">Performance</h3>
          <CleanerDashboardInfoHint
            label="About performance"
            text="Based on your completed jobs and customer feedback."
          />
        </div>
      </div>

      <div className="mt-3">
        <CleanerPerformanceStatsRow metrics={metrics} />
      </div>
    </Card>
  );
}
