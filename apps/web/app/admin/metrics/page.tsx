"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DispatchMetricsSnapshot, DispatchMetricsWindow } from "@/lib/admin/metrics";
import { attemptSources, DISPATCH_METRICS_UTILIZATION_TIMEZONE } from "@/lib/admin/metrics";
import { cn } from "@/lib/utils";

function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${(n * 100).toFixed(digits)}%`;
}

function num(n: number | null | undefined, digits = 2): string {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toFixed(digits);
}

type CardTone = "neutral" | "good" | "warn" | "bad";

function cardToneClass(tone: CardTone): string {
  if (tone === "good") return "border-emerald-300/80 bg-emerald-50/40 dark:border-emerald-800 dark:bg-emerald-950/25";
  if (tone === "warn") return "border-amber-300/80 bg-amber-50/50 dark:border-amber-800 dark:bg-amber-950/25";
  if (tone === "bad") return "border-rose-300/80 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/30";
  return "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900";
}

function successTone(rate: number | null): CardTone {
  if (rate == null) return "neutral";
  if (rate > 0.95) return "good";
  if (rate >= 0.85) return "warn";
  return "bad";
}

function fallbackTone(rate: number | null): CardTone {
  if (rate == null) return "neutral";
  if (rate < 0.1) return "good";
  if (rate <= 0.2) return "warn";
  return "bad";
}

function capacityRejectTone(rate: number | null): CardTone {
  if (rate == null) return "neutral";
  if (rate < 0.05) return "good";
  if (rate <= 0.1) return "warn";
  return "bad";
}

function latencyTone(p95Ms: number | null): CardTone {
  if (p95Ms == null) return "neutral";
  if (p95Ms < 800) return "good";
  if (p95Ms <= 1500) return "warn";
  return "bad";
}

function utilizationBadgeClass(label: "high" | "medium" | "low" | "na"): string {
  if (label === "high") return "bg-rose-100 text-rose-900 dark:bg-rose-950/60 dark:text-rose-100";
  if (label === "medium") return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
  if (label === "low") return "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100";
  return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300";
}

function utilizationLabelText(label: "high" | "medium" | "low" | "na"): string {
  if (label === "high") return "High (>90%)";
  if (label === "medium") return "Medium (60–90%)";
  if (label === "low") return "Low (<60%)";
  return "N/A";
}

function formatDeltaPp(value: number | null, invert: boolean): { text: string; className: string } | null {
  if (value == null || Number.isNaN(value)) return null;
  if (Math.abs(value) < 0.0005) {
    return { text: "0 pp", className: "text-zinc-500 dark:text-zinc-400" };
  }
  const sign = value > 0 ? "+" : "";
  const text = `${sign}${value.toFixed(1)} pp`;
  const favorable = invert ? value < 0 : value > 0;
  const unfavorable = invert ? value > 0 : value < 0;
  const className = favorable
    ? "text-emerald-600 dark:text-emerald-400"
    : unfavorable
      ? "text-rose-600 dark:text-rose-400"
      : "text-zinc-500";
  return { text, className };
}

function DeltaLine({ label, delta, invert }: { label: string; delta: number | null; invert: boolean }) {
  const f = formatDeltaPp(delta, invert);
  if (!f) return <p className="mt-1 text-xs text-zinc-500">vs prior window: —</p>;
  return (
    <p className="mt-1 text-xs">
      <span className="text-zinc-500">vs prior window: </span>
      <span className={cn("font-medium", f.className)}>
        {f.text} {label}
      </span>
    </p>
  );
}

type ApiPayload = DispatchMetricsSnapshot & { cacheTtlSeconds?: number; error?: string };

export default function AdminDispatchMetricsPage() {
  const [window, setWindow] = useState<DispatchMetricsWindow>("24h");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ApiPayload | null>(null);

  const load = useCallback(async (w: DispatchMetricsWindow) => {
    const sb = getSupabaseBrowser();
    const token = (await sb?.auth.getSession())?.data.session?.access_token;
    if (!token) {
      setError("Sign in as admin.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/admin/dispatch-metrics?window=${encodeURIComponent(w)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = (await res.json()) as ApiPayload;
    if (!res.ok) {
      setError(json.error ?? "Failed to load metrics.");
      setData(null);
    } else {
      setData(json);
      setError(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load(window);
  }, [load, window]);

  const cur = data?.current;
  const deltas = data?.rateDeltas;
  const hasAssignmentAttempts = (cur?.assignmentAttempts ?? 0) > 0;

  const emptyAssignmentWindow = useMemo(() => {
    if (!data) return true;
    return !hasAssignmentAttempts && data.current.allocationMetricRows === 0;
  }, [data, hasAssignmentAttempts]);

  const showRates = hasAssignmentAttempts;

  return (
    <main className="mx-auto max-w-6xl space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Dispatch metrics</h2>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
            Assignment health from <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">system_logs</code>
            {data?.cacheTtlSeconds != null ? (
              <>
                {" "}
                · snapshot cached ~{data.cacheTtlSeconds}s server-side
              </>
            ) : null}
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Terminal attempt sources (single denominator):{" "}
            <span className="font-mono">{attemptSources.join(", ")}</span>
          </p>
        </div>
        <div className="flex shrink-0 rounded-lg border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900">
          {(["24h", "7d"] as const).map((w) => (
            <button
              key={w}
              type="button"
              disabled={loading}
              onClick={() => setWindow(w)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition",
                window === w
                  ? "bg-blue-600 text-white"
                  : "text-zinc-600 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800",
              )}
            >
              {w === "24h" ? "Last 24 hours" : "Last 7 days"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl bg-zinc-200 dark:bg-zinc-800" />
          ))}
        </div>
      ) : error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </p>
      ) : (
        <>
          {!data?.hasDispatchActivity ? (
            <p className="rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              No dispatch activity in this window yet. Metrics stay blank (not 0%) until terminal assignment logs appear.
            </p>
          ) : null}

          {data?.hasDispatchActivity && emptyAssignmentWindow ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50/80 px-4 py-3 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
              No assignment terminal logs in this window (no rows in {attemptSources.join(", ")}). Other events (e.g. member
              adds) may still appear below.
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Card className={cn("border-2", cardToneClass(showRates ? successTone(cur?.assignmentSuccessRate ?? null) : "neutral"))}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Assignment success</CardTitle>
                <CardDescription>
                  Success ÷ terminal attempts ({attemptSources.join(", ")}). One row per completed assignment attempt.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {showRates ? pct(cur?.assignmentSuccessRate ?? null, 1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {cur?.assignmentSuccess ?? 0} / {cur?.assignmentAttempts ?? 0} attempts
                </p>
                <DeltaLine label="success rate" delta={deltas?.successRatePctPoints ?? null} invert={false} />
              </CardContent>
            </Card>

            <Card className="border-2 border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Failure rate</CardTitle>
                <CardDescription>
                  <span className="font-mono text-[11px]">TEAM_ASSIGNMENT_FAILED</span> ÷ terminal attempts.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {showRates ? pct(cur?.assignmentFailureRate ?? null, 1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{cur?.assignmentFailed ?? 0} failed</p>
                <DeltaLine label="failure rate" delta={deltas?.failureRatePctPoints ?? null} invert />
              </CardContent>
            </Card>

            <Card className="border-2 border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">No-candidate rate</CardTitle>
                <CardDescription>
                  <span className="font-mono text-[11px]">TEAM_ASSIGNMENT_NO_CANDIDATES</span> ÷ terminal attempts. High →
                  coverage / roster gap.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {showRates ? pct(cur?.noCandidateRate ?? null, 1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{cur?.assignmentNoCandidates ?? 0} no-candidate outcomes</p>
                <DeltaLine label="no-candidate rate" delta={deltas?.noCandidateRatePctPoints ?? null} invert />
              </CardContent>
            </Card>

            <Card
              className={cn(
                "border-2",
                cardToneClass(showRates ? capacityRejectTone(cur?.capacityRejectRatePerAttempt ?? null) : "neutral"),
              )}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Capacity reject / attempt</CardTitle>
                <CardDescription>
                  <span className="font-mono text-[11px]">TEAM_CAPACITY_REJECTED</span> ÷ terminal attempts (not ÷
                  successes). Separates “teams full” from “no teams”.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {showRates ? pct(cur?.capacityRejectRatePerAttempt ?? null, 1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{cur?.capacityRejected ?? 0} capacity rejects</p>
                <DeltaLine label="capacity reject / attempt" delta={deltas?.capacityRejectPerAttemptPctPoints ?? null} invert />
              </CardContent>
            </Card>

            <Card className={cn("border-2", cardToneClass(showRates ? fallbackTone(cur?.fallbackRateVsSuccess ?? null) : "neutral"))}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fallback rate</CardTitle>
                <CardDescription>
                  <span className="font-mono text-[11px]">TEAM_ASSIGNMENT_FALLBACK</span> per successful assignment.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {showRates ? pct(cur?.fallbackRateVsSuccess ?? null, 1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{cur?.assignmentFallback ?? 0} fallback logs</p>
                <DeltaLine label="fallback rate" delta={deltas?.fallbackRateVsSuccessPctPoints ?? null} invert />
              </CardContent>
            </Card>

            <Card className="border-2 border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Fallback depth</CardTitle>
                <CardDescription>
                  From allocation metrics (success): depth = <span className="font-mono text-[11px]">attemptCount − 1</span>,
                  and share with depth &gt; 0 or <span className="font-mono text-[11px]">fallbackUsed</span>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  Avg depth {num(cur?.avgFallbackDepth ?? null, 2)}
                </p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  With fallback {pct(cur?.pctSuccessMetricsWithFallbackDepth ?? null, 1)}
                </p>
                <p className="mt-1 text-xs text-zinc-500">Mean attempts {num(cur?.avgAttempts ?? null, 2)}</p>
              </CardContent>
            </Card>

            <Card className={cn("border-2", cardToneClass(latencyTone(cur?.p95LatencyMs ?? null)))}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Assignment latency</CardTitle>
                <CardDescription>
                  Linear percentile of <span className="font-mono text-[11px]">assignmentDurationMs</span> on all allocation
                  metric rows in window.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  p50 {cur?.p50LatencyMs != null ? `${Math.round(cur.p50LatencyMs)} ms` : "—"}
                </p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  p95 {cur?.p95LatencyMs != null ? `${Math.round(cur.p95LatencyMs)} ms` : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{cur?.allocationMetricRows ?? 0} metric rows (capped fetch)</p>
              </CardContent>
            </Card>

            <Card className="border-2 border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Member add failure</CardTitle>
                <CardDescription>
                  <span className="font-mono text-[11px]">TEAM_MEMBERS_ADD_FAILED</span> ÷{" "}
                  <span className="font-mono text-[11px]">TEAM_MEMBERS_ADD%</span>.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
                  {(cur?.memberAddEvents ?? 0) > 0 ? pct(cur?.memberAddFailureRate ?? null, 1) : "—"}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {cur?.memberAddFailed ?? 0} / {cur?.memberAddEvents ?? 0} events
                </p>
                <DeltaLine label="member-add failure rate" delta={deltas?.memberAddFailureRatePctPoints ?? null} invert />
              </CardContent>
            </Card>
          </div>

          {cur && !cur.attemptsSanityOk ? (
            <p className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-2 text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100">
              Sanity check: count of logs in <span className="font-mono">attemptSources</span> does not equal SUCCESS +
              FAILED + NO_CANDIDATES for the current window — investigate duplicate or unexpected sources.
            </p>
          ) : null}

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Team utilization</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Jobs = team bookings with <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">is_team_job</code>{" "}
              and <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">created_at</code> on calendar date{" "}
              <span className="font-mono text-xs">{data?.todayYmdJohannesburg}</span> in{" "}
              <span className="font-mono text-xs">{DISPATCH_METRICS_UTILIZATION_TIMEZONE}</span>. Utilization = jobs ÷
              capacity.
            </p>

            {!data?.teams.length ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                No teams configured.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900/80 dark:text-zinc-400">
                      <th className="px-4 py-3">Team</th>
                      <th className="px-4 py-3 text-right">Jobs / capacity</th>
                      <th className="px-4 py-3 text-right">Roster (active)</th>
                      <th className="px-4 py-3 text-right">Utilization</th>
                      <th className="px-4 py-3">Load</th>
                      <th className="px-4 py-3">Capacity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.teams.map((row) => (
                      <tr
                        key={row.teamId}
                        className="border-b border-zinc-100 last:border-0 dark:border-zinc-800/80"
                      >
                        <td className="px-4 py-3 font-medium text-zinc-900 dark:text-zinc-100">{row.name}</td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                          {row.jobsToday} / {row.capacityPerDay}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                          {row.activeMembersToday}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums text-zinc-700 dark:text-zinc-300">
                          {row.utilization != null ? pct(row.utilization, 0) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
                              utilizationBadgeClass(row.utilizationLabel),
                            )}
                          >
                            {utilizationLabelText(row.utilizationLabel)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {row.atCapacity ? (
                            <span className="inline-flex rounded-full bg-rose-100 px-2.5 py-0.5 text-xs font-semibold text-rose-900 dark:bg-rose-950/60 dark:text-rose-100">
                              At capacity
                            </span>
                          ) : (
                            <span className="text-xs text-zinc-400">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Roster vs capacity</h3>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Active roster on <span className="font-mono text-xs">{data?.todayYmdJohannesburg}</span> (
              {DISPATCH_METRICS_UTILIZATION_TIMEZONE}) vs <code className="rounded bg-zinc-100 px-1 text-xs dark:bg-zinc-800">capacity_per_day</code>.
            </p>
            {!data?.staffingMismatches.length ? (
              <p className="rounded-xl border border-zinc-200 bg-white px-4 py-6 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                All teams match capacity for today&apos;s roster window.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-200 rounded-xl border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
                {data.staffingMismatches.map((m) => (
                  <li key={m.teamId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">{m.name}</span>
                    <span className="text-zinc-600 dark:text-zinc-400">
                      {m.activeMembersToday} active members · capacity {m.capacityPerDay}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </main>
  );
}
