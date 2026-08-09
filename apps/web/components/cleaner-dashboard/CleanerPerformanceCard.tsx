"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { CleanerDashboardInfoHint } from "./CleanerDashboardInfoHint";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { cn } from "@/lib/utils";

export type CleanerPerformanceMetrics = { jobsCompleted: number | null; rating: number | null; completionPct: number | null };
type SelfPerformance = { scorecard?: { overallScore: number | null; grade: string; evidenceCoverage: number; components: { quality: { score: number | null }; customerFeedback: { score: number | null }; reliability: { score: number | null }; completion: { score: number | null }; attendance: { score: number | null } } } | null };

function dash(n: number | null, format: (v: number) => string): string { return n == null ? "—" : format(n); }
function pct(n: number | null | undefined): string { return n == null ? "—" : `${Math.round(n)}%`; }

function useCanonicalCleanerPerformance() {
  const [canonical, setCanonical] = useState<SelfPerformance["scorecard"]>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers) return;
      const res = await cleanerAuthenticatedFetch("/api/cleaner/performance?days=90", { headers });
      if (!res.ok) return;
      const body = (await res.json().catch(() => null)) as SelfPerformance | null;
      if (!cancelled) setCanonical(body?.scorecard ?? null);
    })();
    return () => { cancelled = true; };
  }, []);
  return canonical;
}

export function CleanerPerformanceStatsRow({ metrics, compact }: { metrics: CleanerPerformanceMetrics; compact?: boolean }) {
  const { jobsCompleted, rating, completionPct } = metrics;
  const canonical = useCanonicalCleanerPerformance();
  const ratingText = useMemo(() => rating == null ? "—" : `${(Math.round(rating * 10) / 10).toFixed(1)} ★`, [rating]);
  const ratingClass = useMemo(() => rating == null ? "text-foreground" : rating >= 4.5 ? "text-emerald-600 dark:text-emerald-400" : rating < 4.0 ? "text-red-600 dark:text-red-400" : "text-foreground", [rating]);
  const val = compact ? "text-base font-semibold tabular-nums" : "text-lg font-semibold tabular-nums";
  const lab = compact ? "text-[10px] text-muted-foreground" : "text-xs text-muted-foreground";

  if (canonical) return <div className={cn("grid grid-cols-3 gap-2 text-center sm:text-left", compact && "gap-3")}><div><p className={lab}>Performance</p><p className={cn(val, "text-foreground")}>{pct(canonical.overallScore)}</p></div><div><p className={lab}>Grade</p><p className={cn(val, "text-foreground")}>{canonical.grade}</p></div><div><p className={lab}>Evidence</p><p className={cn(val, "text-foreground")}>{pct(canonical.evidenceCoverage)}</p></div></div>;

  return <div className={cn("grid grid-cols-3 gap-2 text-center sm:text-left", compact && "gap-3")}><div><p className={lab}>Jobs</p><p className={cn(val, "text-foreground")}>{dash(jobsCompleted, String)}</p></div><div><p className={lab}>Rating</p><p className={cn(val, ratingClass)}>{ratingText}</p></div><div><p className={lab}>Completion</p><p className={cn(val, "text-foreground")}>{dash(completionPct, (v) => `${v}%`)}</p></div></div>;
}

export function CleanerPerformanceCard({ metrics }: { metrics: CleanerPerformanceMetrics }) {
  const canonical = useCanonicalCleanerPerformance();
  return <Card className="rounded-2xl border border-border p-4 shadow-sm"><div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1.5"><h3 className="text-base font-semibold text-foreground">Performance</h3><CleanerDashboardInfoHint label="About performance" text="Your official score uses QA, customer reviews, reliability, completion and on-time start evidence. Earnings do not affect it." /></div></div>{canonical ? <div className="mt-3 rounded-xl border border-border bg-muted/30 p-3"><div className="grid grid-cols-3 gap-2 text-center"><div><p className="text-[10px] text-muted-foreground">Overall</p><p className="text-lg font-semibold tabular-nums">{pct(canonical.overallScore)}</p></div><div><p className="text-[10px] text-muted-foreground">Grade</p><p className="text-lg font-semibold">{canonical.grade}</p></div><div><p className="text-[10px] text-muted-foreground">Evidence</p><p className="text-lg font-semibold tabular-nums">{pct(canonical.evidenceCoverage)}</p></div></div><div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs text-muted-foreground sm:grid-cols-5"><span>QA {pct(canonical.components.quality.score)}</span><span>Reviews {pct(canonical.components.customerFeedback.score)}</span><span>Reliability {pct(canonical.components.reliability.score)}</span><span>Completion {pct(canonical.components.completion.score)}</span><span>Attendance {pct(canonical.components.attendance.score)}</span></div></div> : null}<div className="mt-3"><CleanerPerformanceStatsRow metrics={metrics} /></div></Card>;
}
