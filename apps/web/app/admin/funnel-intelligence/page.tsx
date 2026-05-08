"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

type InsightRow = {
  id: string;
  severity: "info" | "warning" | "critical";
  category: string;
  title: string;
  detail: string;
};

type AnomalyRow = {
  id: string;
  severity: "info" | "warning" | "critical";
  metric: string;
  message: string;
  observed?: number;
  baseline?: number;
};

function severityStyles(severity: InsightRow["severity"]): string {
  switch (severity) {
    case "critical":
      return "border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-100";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900/60 dark:text-zinc-50";
  }
}

export default function FunnelIntelligencePage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<InsightRow[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyRow[]>([]);
  const [conversionRatePct, setConversionRatePct] = useState<number | null>(null);
  const [sessions, setSessions] = useState<number | null>(null);
  const [narrativeSummary, setNarrativeSummary] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) {
        if (!cancelled) {
          setError("Sign in as admin.");
          setLoading(false);
        }
        return;
      }
      const res = await fetch("/api/admin/booking-funnel", { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as {
        error?: string;
        insights?: InsightRow[];
        anomalies?: AnomalyRow[];
        conversionRatePct?: number;
        sessions?: number;
        narrativeSummary?: string;
      };
      if (cancelled) return;
      if (!res.ok) {
        setError(json.error ?? "Failed to load funnel intelligence.");
        setLoading(false);
        return;
      }
      setInsights(Array.isArray(json.insights) ? json.insights : []);
      setAnomalies(Array.isArray(json.anomalies) ? json.anomalies : []);
      setConversionRatePct(typeof json.conversionRatePct === "number" ? json.conversionRatePct : null);
      setSessions(typeof json.sessions === "number" ? json.sessions : null);
      setNarrativeSummary(typeof json.narrativeSummary === "string" && json.narrativeSummary.trim() ? json.narrativeSummary.trim() : null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Funnel intelligence</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Automated insights and anomaly flags derived from canonical booking analytics (
            <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">analytics_session_id</code> correlation,{" "}
            <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">booking_events</code>, and{" "}
            <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">user_events</code>). Charts and raw funnel metrics
            remain on{" "}
            <Link href="/admin/analytics" className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400">
              Analytics
            </Link>
            .
          </p>
        </div>
        {!loading && conversionRatePct != null && (
          <div className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-right dark:border-zinc-800 dark:bg-zinc-900">
            <p className="text-xs text-zinc-500">Checkout reach (quote starts)</p>
            <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{conversionRatePct.toFixed(1)}%</p>
            {sessions != null && <p className="text-xs text-zinc-500">{sessions} correlated sessions</p>}
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-40 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-40 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : (
        <div className="space-y-6">
          {narrativeSummary && (
            <Card className="border-blue-200/80 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/25">
              <CardHeader>
                <CardTitle className="text-base">Executive summary</CardTitle>
                <CardDescription>Generated from checkout reach, insights, and anomaly flags for this window.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-relaxed text-zinc-800 dark:text-zinc-100">{narrativeSummary}</p>
              </CardContent>
            </Card>
          )}
          <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Insight feed</CardTitle>
              <CardDescription>Rule-based narrative signals — not a replacement for investigation.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {insights.length === 0 ? (
                <p className="text-sm text-zinc-500">No insights for this window.</p>
              ) : (
                insights.map((row) => (
                  <div key={row.id} className={`rounded-lg border px-3 py-2 text-sm ${severityStyles(row.severity)}`}>
                    <p className="font-medium">{row.title}</p>
                    <p className="mt-1 text-xs opacity-90">{row.detail}</p>
                    <p className="mt-2 text-[10px] uppercase tracking-wide opacity-70">{row.category}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Anomaly monitor</CardTitle>
              <CardDescription>Threshold comparisons vs recent baseline (UTC daily trends).</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {anomalies.length === 0 ? (
                <p className="text-sm text-zinc-500">No anomalies flagged.</p>
              ) : (
                anomalies.map((row) => (
                  <div key={row.id} className={`rounded-lg border px-3 py-2 text-sm ${severityStyles(row.severity)}`}>
                    <p className="font-medium">{row.message}</p>
                    <p className="mt-1 font-mono text-xs opacity-80">{row.metric}</p>
                    {row.observed != null && (
                      <p className="mt-1 text-xs opacity-80">
                        Observed: {typeof row.observed === "number" ? row.observed.toFixed(1) : row.observed}
                        {row.baseline != null ? ` · Baseline: ${row.baseline.toFixed(1)}` : ""}
                      </p>
                    )}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          </div>
        </div>
      )}

      <p className="text-xs text-zinc-500">
        Rollups: populate <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">daily_*_metrics</code> tables via scheduled job;
        refresh <code className="rounded bg-zinc-100 px-1 dark:bg-zinc-800">mv_*</code> materialized views nightly for warehouse-style
        dashboards.
      </p>
    </main>
  );
}
