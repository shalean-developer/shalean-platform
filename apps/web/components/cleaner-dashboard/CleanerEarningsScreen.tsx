"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { earningsPeriodCentsFromRows } from "@/lib/cleaner/cleanerEarningsPeriodTotals";
import { buildEarningsInsightMessages, buildLast7DaysEarningsPoints } from "@/lib/cleaner/earningsInsightsSeries";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import type { CleanerPayoutSummaryRow } from "@/lib/cleaner/cleanerPayoutSummaryTypes";
import {
  bookingStatusBadgeLabel,
  countJobsAndCentsForToday,
  countJobsInWeek,
  dayHeading,
  getJhbIsoWeekStartYmd,
  groupRowsByDayForTimeline,
  jhbTimeLabel,
  lastJobInPeriod,
  paidThisWeekCents,
  payoutArrivalSummaryJohannesburg,
  priorIsoWeekEarnedCents,
  weekOverWeekMomentum,
  type CleanerEarningsRowWire,
  type EarningsPeriod,
} from "@/lib/cleaner/earnings";
import { johannesburgCalendarYmd } from "@/lib/dashboard/johannesburgMonth";
import { isoWeekdayFromYmd } from "@/lib/recurring/johannesburgCalendar";
import { metrics } from "@/lib/metrics/counters";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { Header } from "./Header";
import { CleanerEarningsWeeklyBarChart } from "./CleanerEarningsWeeklyBarChart";

const EMPTY_EARNINGS_ROWS: CleanerEarningsRowWire[] = [];

type EarningsJson = {
  error?: string;
  /** Server snapshot time for this payload (ISO 8601). */
  as_of?: string;
  source_of_truth?: "booking" | "ledger";
  finance_shadow?: {
    booking_ids_in_slice: number;
    delta_all_cents: number;
    bucket_aligned: boolean;
    shadow_mismatch: boolean;
    missing_ledger_expected_count: number;
  };
  total_all_time?: number;
  summary?: {
    today_cents?: number;
    week_cents?: number;
    month_cents?: number;
    pending_cents?: number;
    eligible_cents?: number;
    paid_cents?: number;
    invalid_cents?: number;
    frozen_batch_cents?: number;
    suggested_daily_goal_cents?: number;
  };
  rows?: CleanerEarningsRowWire[];
  has_failed_transfer?: boolean;
  paymentDetails?: {
    readyForPayout?: boolean;
    missingBankDetails?: boolean;
  };
};

function cents(n: unknown): number {
  return typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
}

export function CleanerEarningsScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightJobId = (searchParams.get("job") ?? "").trim();
  const highlightedRowRef = useRef<HTMLLIElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<EarningsJson | null>(null);
  const [nowTick, setNowTick] = useState(() => new Date());
  const [lastFetchedAtMs, setLastFetchedAtMs] = useState<number | null>(null);
  const [updatedLabelTick, setUpdatedLabelTick] = useState(0);

  const period = useMemo((): EarningsPeriod => {
    const r = (searchParams.get("range") ?? "").trim().toLowerCase();
    if (r === "week" || r === "month" || r === "today") return r;
    return "today";
  }, [searchParams]);

  const highlightDayYmd = useMemo(() => {
    const d = (searchParams.get("day") ?? "").trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : "";
  }, [searchParams]);

  useEffect(() => {
    if (!highlightJobId) return;
    window.requestAnimationFrame(() => {
      highlightedRowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [highlightJobId, payload?.rows]);

  const syncRangeToUrl = useCallback(
    (next: EarningsPeriod) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("range", next);
      if (highlightJobId) nextParams.set("job", highlightJobId);
      else nextParams.delete("job");
      if (highlightDayYmd) nextParams.set("day", highlightDayYmd);
      else nextParams.delete("day");
      router.replace(`/cleaner/earnings?${nextParams.toString()}`, { scroll: false });
    },
    [router, searchParams, highlightJobId, highlightDayYmd],
  );

  const syncChartDayToUrl = useCallback(
    (ymd: string | null) => {
      const nextParams = new URLSearchParams(searchParams.toString());
      nextParams.set("range", "week");
      if (highlightJobId) nextParams.set("job", highlightJobId);
      else nextParams.delete("job");
      if (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd)) nextParams.set("day", ymd);
      else nextParams.delete("day");
      router.replace(`/cleaner/earnings?${nextParams.toString()}`, { scroll: false });
    },
    [router, searchParams, highlightJobId],
  );

  const load = useCallback(async () => {
    const headers = await getCleanerAuthHeaders();
    if (!headers) {
      setError("Not signed in.");
      setLoading(false);
      return;
    }
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    try {
      const res = await cleanerAuthenticatedFetch("/api/cleaner/earnings", { headers });
      const j = (await res.json().catch(() => ({}))) as EarningsJson;
      if (!res.ok) throw new Error(j.error ?? "Could not load earnings.");
      setPayload(j);
      setError(null);
      setNowTick(new Date());
      setLastFetchedAtMs(Date.now());
      const rowsLen = Array.isArray(j.rows) ? j.rows.length : 0;
      const chartRowsForMetric: CleanerPayoutSummaryRow[] = (Array.isArray(j.rows) ? j.rows : []).map((r) => ({
        booking_id: r.booking_id,
        date: r.date,
        completed_at: r.completed_at,
        service: r.service,
        location: r.location,
        payout_status: r.payout_status as CleanerPayoutSummaryRow["payout_status"],
        payout_frozen_cents: r.payout_frozen_cents,
        amount_cents: cents(r.amount_cents),
        payout_paid_at: r.payout_paid_at,
        payout_run_id: r.payout_run_id,
        in_frozen_batch: r.in_frozen_batch,
        ...(r.__invalid ? { __invalid: true as const } : {}),
      }));
      metrics.increment("cleaner.earnings_fetch_client", {
        latency_ms: Math.round((typeof performance !== "undefined" ? performance.now() : 0) - t0),
        rows_count: rowsLen,
        earnings_chart_points_count: buildLast7DaysEarningsPoints(chartRowsForMetric, new Date()).length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load earnings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial earnings fetch on mount
    void load();
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      void load();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [load]);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setUpdatedLabelTick((n) => n + 1);
      setNowTick(new Date());
    }, 15_000);
    return () => window.clearInterval(id);
  }, []);

  const updatedAgoLabel = useMemo(() => {
    void updatedLabelTick;
    const asOfMs = payload?.as_of ? Date.parse(payload.as_of) : NaN;
    const anchorMs = Number.isFinite(asOfMs) ? asOfMs : lastFetchedAtMs;
    if (anchorMs == null || !Number.isFinite(anchorMs)) return null;
    const sec = Math.max(0, Math.floor((nowTick.getTime() - anchorMs) / 1000));
    if (sec < 45) return "Updated just now";
    if (sec < 3600) return `Updated ${Math.floor(sec / 60)}m ago`;
    return `Updated ${Math.floor(sec / 3600)}h ago`;
  }, [payload?.as_of, lastFetchedAtMs, updatedLabelTick, nowTick]);

  const summary = payload?.summary;
  const rows = payload?.rows ?? EMPTY_EARNINGS_ROWS;
  const paymentDetails = payload?.paymentDetails;
  const hasFailedTransfer = Boolean(payload?.has_failed_transfer);
  const lifetimeLedgerCents = cents(payload?.total_all_time);

  const now = nowTick;
  const todayY = useMemo(() => johannesburgCalendarYmd(now), [now]);
  const isoWeekday = useMemo(() => isoWeekdayFromYmd(todayY), [todayY]);
  const weekStart = useMemo(() => getJhbIsoWeekStartYmd(now), [now]);
  const monthPrefix = todayY.slice(0, 7);

  const thisWeekEarnedFromRows = useMemo(() => {
    return earningsPeriodCentsFromRows(
      rows.map((r) => ({
        completed_at: r.completed_at,
        schedule_date: r.date,
        amount_cents: cents(r.amount_cents),
      })),
      now,
    ).week_cents;
  }, [rows, now]);

  const priorWeekCents = useMemo(() => priorIsoWeekEarnedCents(rows, now), [rows, now]);
  const momentum = useMemo(
    () => weekOverWeekMomentum(thisWeekEarnedFromRows, priorWeekCents),
    [thisWeekEarnedFromRows, priorWeekCents],
  );
  const payoutArrival = useMemo(() => payoutArrivalSummaryJohannesburg(now), [now]);

  const chartRows = useMemo((): CleanerPayoutSummaryRow[] => {
    return rows.map((r) => ({
      booking_id: r.booking_id,
      date: r.date,
      completed_at: r.completed_at,
      service: r.service,
      location: r.location,
      payout_status: r.payout_status as CleanerPayoutSummaryRow["payout_status"],
      payout_frozen_cents: r.payout_frozen_cents,
      amount_cents: cents(r.amount_cents),
      payout_paid_at: r.payout_paid_at,
      payout_run_id: r.payout_run_id,
      in_frozen_batch: r.in_frozen_batch,
      ...(r.__invalid ? { __invalid: true as const } : {}),
    }));
  }, [rows]);

  const points = useMemo(() => buildLast7DaysEarningsPoints(chartRows, now), [chartRows, now]);
  const bestDay = useMemo(() => {
    let best = points[0];
    for (const p of points) {
      if (p.cents > (best?.cents ?? 0)) best = p;
    }
    return best;
  }, [points]);

  const insightMessages = useMemo(() => {
    if (!summary) return [];
    const pendingJobs = rows.filter((r) => String(r.payout_status).toLowerCase() === "pending").length;
    return buildEarningsInsightMessages({
      summary: {
        pending_cents: cents(summary.pending_cents),
        eligible_cents: cents(summary.eligible_cents),
        paid_cents: cents(summary.paid_cents),
        frozen_batch_cents: cents(summary.frozen_batch_cents),
        week_cents: cents(summary.week_cents),
        month_cents: cents(summary.month_cents),
      },
      points,
      pendingJobRows: pendingJobs,
      hasFailedTransfer: hasFailedTransfer,
      missingBankDetails: Boolean(paymentDetails?.missingBankDetails),
    });
  }, [summary, rows, points, hasFailedTransfer, paymentDetails?.missingBankDetails]);

  const todayAmt = cents(summary?.today_cents);
  const weekAmt = cents(summary?.week_cents);
  const monthAmt = cents(summary?.month_cents);
  const goalAmt = cents(summary?.suggested_daily_goal_cents);

  const periodAmt = period === "today" ? todayAmt : period === "week" ? weekAmt : monthAmt;
  const periodLabel = period === "today" ? "Today" : period === "week" ? "This week" : "This month";

  const { jobs: jobsToday, cents: todayFromRows } = useMemo(
    () => countJobsAndCentsForToday(rows, todayY),
    [rows, todayY],
  );
  const jobsWeek = useMemo(() => countJobsInWeek(rows, todayY, weekStart), [rows, todayY, weekStart]);
  const avgPerJobToday = jobsToday > 0 ? Math.round(todayFromRows / jobsToday) : 0;

  const lastInPeriod = useMemo(
    () => lastJobInPeriod(rows, period, todayY, weekStart, monthPrefix),
    [rows, period, todayY, weekStart, monthPrefix],
  );
  const lastJobCents = lastInPeriod ? cents(lastInPeriod.amount_cents) : 0;

  const pctOfGoal = goalAmt > 0 ? Math.round((todayAmt / goalAmt) * 100) : 0;
  const aboveGoalPct = goalAmt > 0 && todayAmt > goalAmt ? Math.round(((todayAmt - goalAmt) / goalAmt) * 100) : 0;

  const projectedWeek =
    isoWeekday >= 1 && weekAmt > 0 ? Math.round((weekAmt / isoWeekday) * 7) : weekAmt;

  const remainingToGoal = Math.max(0, goalAmt - todayAmt);
  const avgForGoalHint = jobsToday > 0 ? todayAmt / jobsToday : jobsWeek > 0 ? weekAmt / jobsWeek : 0;
  const jobsToGoal =
    remainingToGoal > 0 && avgForGoalHint > 0 ? Math.ceil(remainingToGoal / avgForGoalHint) : null;

  const eligible = cents(summary?.eligible_cents);
  const frozen = cents(summary?.frozen_batch_cents);
  const pending = cents(summary?.pending_cents);
  const paidWeek = useMemo(() => paidThisWeekCents(rows, now), [rows, now]);

  const availableForPayout = eligible;
  const processingPipeline = frozen + pending;

  const timelineByDay = useMemo(() => groupRowsByDayForTimeline(rows), [rows]);
  const timelineDays = useMemo(() => Array.from(timelineByDay.keys()).sort((a, b) => b.localeCompare(a)), [timelineByDay]);
  const timelineDaysFiltered = useMemo(() => {
    if (!highlightDayYmd) return timelineDays;
    return timelineDays.filter((d) => d === highlightDayYmd);
  }, [timelineDays, highlightDayYmd]);

  const projectionUnderWeekGoal =
    goalAmt > 0 &&
    weekAmt > 0 &&
    isoWeekday >= 1 &&
    projectedWeek > 0 &&
    projectedWeek < goalAmt * 7 * 0.85;

  const hasRows = rows.length > 0;
  const showEmpty = !loading && !error && !hasRows;

  return (
    <div className="mx-auto min-h-[100dvh] w-full max-w-lg bg-background pb-28">
      <div className="space-y-4 p-4">
        <Header />
        <Link href="/cleaner/dashboard" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          ← Dashboard
        </Link>
      </div>

      {loading ? (
        <div className="px-4">
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
      ) : error ? (
        <div className="px-4">
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
            Try again
          </Button>
        </div>
      ) : showEmpty ? (
        <div className="space-y-4 px-4">
          <h1 className="sr-only">Earnings</h1>
          <Card className="rounded-2xl border-dashed p-8 text-center shadow-sm">
            <p className="text-lg font-semibold text-foreground">No earnings yet today</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Demand is often highest mid-week — open jobs to pick up a slot near you.
            </p>
            <Button asChild className="mt-6">
              <Link href="/cleaner/jobs?sort=nearest&available=true">Browse open jobs</Link>
            </Button>
          </Card>
        </div>
      ) : (
        <>
          <h1 className="sr-only">Earnings</h1>
          <div className="sticky top-0 z-20 border-b border-border/80 bg-background/95 px-4 pb-3 pt-0 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
            <Card className="overflow-hidden rounded-2xl p-5 shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{periodLabel} earnings</p>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">{formatZarFromCents(periodAmt)}</p>
              {lastJobCents > 0 ? (
                <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  +{formatZarFromCents(lastJobCents)} from last job
                </p>
              ) : period === "today" ? (
                <p className="mt-1 text-sm text-muted-foreground">No earnings logged for today yet.</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No completed-job earnings in this period yet.</p>
              )}
              <Tabs value={period} onValueChange={(v) => syncRangeToUrl(v as EarningsPeriod)} className="mt-4 w-full">
                <TabsList className="grid h-auto w-full grid-cols-3 gap-1 rounded-xl p-1">
                  <TabsTrigger value="today" className="text-xs sm:text-sm">
                    Today
                  </TabsTrigger>
                  <TabsTrigger value="week" className="text-xs sm:text-sm">
                    Week
                  </TabsTrigger>
                  <TabsTrigger value="month" className="text-xs sm:text-sm">
                    Month
                  </TabsTrigger>
                </TabsList>
              </Tabs>
              {lifetimeLedgerCents > 0 ? (
                <p className="mt-3 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Total in earnings ledger:</span>{" "}
                  {formatZarFromCents(lifetimeLedgerCents)}
                  <span className="block pt-1 opacity-90">All recorded cleaner earnings line items (pending + paid).</span>
                </p>
              ) : null}
              <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
                Totals use South African time (SAST). Refreshes every minute while this tab is open.
                {updatedAgoLabel ? (
                  <>
                    {" "}
                    <span className="font-medium text-foreground/90">{updatedAgoLabel}</span>.
                  </>
                ) : null}
              </p>
            </Card>
          </div>

          <div className="space-y-4 px-4 pt-4" aria-labelledby="earnings-body-heading">
            <h2 id="earnings-body-heading" className="text-lg font-semibold text-foreground">
              Overview
            </h2>

            {(insightMessages.length > 0 ||
              (period === "week" && projectedWeek > 0) ||
              (bestDay && bestDay.cents > 0 && period === "week") ||
              (jobsToGoal != null && jobsToGoal > 0 && goalAmt > 0) ||
              momentum.message ||
              momentum.recoveryHint ||
              projectionUnderWeekGoal) ? (
              <ul className="space-y-1.5 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-foreground">
                {momentum.message ? <li className="font-medium text-foreground">{momentum.message}</li> : null}
                {momentum.recoveryHint ? <li className="text-muted-foreground">{momentum.recoveryHint}</li> : null}
                {projectionUnderWeekGoal ? (
                  <li className="text-muted-foreground">
                    At this week&apos;s pace you&apos;re tracking under a full-week goal at your dashboard target —
                    completing one more job soon moves the projection up.
                  </li>
                ) : null}
                {period === "week" && projectedWeek > 0 ? (
                  <li className="text-muted-foreground">
                    On track for about {formatZarFromCents(projectedWeek)} this week if your pace holds.
                  </li>
                ) : null}
                {bestDay && bestDay.cents > 0 && period === "week" ? (
                  <li className="text-muted-foreground">
                    Best day (7d): {bestDay.label} · {formatZarFromCents(bestDay.cents)}
                  </li>
                ) : null}
                {jobsToGoal != null && jobsToGoal > 0 && goalAmt > 0 ? (
                  <li>
                    Complete about {jobsToGoal} more {jobsToGoal === 1 ? "job" : "jobs"} to reach today&apos;s goal.
                  </li>
                ) : null}
                {insightMessages.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            ) : null}

            {goalAmt > 0 ? (
              <Card className="rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-foreground">Daily goal</p>
                    <p className="text-xs text-muted-foreground">From your recent 7-day pace (dashboard).</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatZarFromCents(goalAmt)}</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-[width] duration-300 ease-out dark:bg-emerald-500"
                    style={{ width: `${Math.min(100, pctOfGoal)}%` }}
                  />
                </div>
                <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Logged today: <span className="font-semibold text-foreground">{formatZarFromCents(todayAmt)}</span>
                  </span>
                  {todayAmt >= goalAmt ? (
                    <span className="font-medium text-emerald-700 dark:text-emerald-400">
                      {aboveGoalPct > 0 ? `+${aboveGoalPct}% above goal` : "Goal reached"}
                      <span aria-hidden> 🎉</span>
                    </span>
                  ) : (
                    <span>{pctOfGoal}% of goal</span>
                  )}
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  {jobsToday > 0 ? (
                    <>
                      {jobsToday} {jobsToday === 1 ? "job" : "jobs"} completed today
                      {avgPerJobToday > 0 ? (
                        <>
                          {" "}
                          · Avg/job {formatZarFromCents(avgPerJobToday)}
                        </>
                      ) : null}
                    </>
                  ) : (
                    "No completed jobs yet today — your next finish will show up here."
                  )}
                </p>
              </Card>
            ) : null}

            <Card className="rounded-2xl p-4 shadow-sm">
              <p className="text-sm font-semibold text-foreground">Payouts</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Weekly batch transfers. &quot;Available&quot; is cleared for the next run; &quot;Processing&quot;
                includes jobs still finalising or locked in a batch.
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Available for payout</span>
                  <span className="font-semibold tabular-nums text-foreground">{formatZarFromCents(availableForPayout)}</span>
                </div>
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">{payoutArrival.headline}</p>
                <p className="text-[11px] leading-snug text-muted-foreground">{payoutArrival.sub}</p>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Processing / finalising</span>
                  <span className="tabular-nums">{formatZarFromCents(processingPipeline)}</span>
                </div>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Paid (this week)</span>
                  <span className="tabular-nums">{formatZarFromCents(paidWeek)}</span>
                </div>
              </div>
              {hasFailedTransfer ? (
                <div className="mt-2 space-y-2 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2" role="status">
                  <p className="text-xs font-medium text-destructive">
                    A transfer to your bank failed recently — fix your details so the next batch can go through.
                  </p>
                  <Button asChild variant="outline" size="sm" className="w-full border-destructive/40">
                    <Link href="/cleaner/profile">Fix bank details</Link>
                  </Button>
                </div>
              ) : null}
              <Dialog
                onOpenChange={(open) => {
                  if (open) metrics.increment("cleaner.earnings_payout_request_clicked");
                }}
              >
                <DialogTrigger asChild>
                  <Button className="mt-4 w-full" type="button">
                    Request payout
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>How payouts work</DialogTitle>
                    <DialogDescription>
                      Cleaners are paid on Shalean&apos;s weekly schedule. Eligible amounts move into the next batch
                      automatically — there is no self-serve instant withdrawal in the app yet.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-2 text-sm text-foreground">
                    <p className="font-medium">{payoutArrival.headline}</p>
                    <p>
                      <span className="font-medium">Available for payout</span> ({formatZarFromCents(availableForPayout)}
                      ) is ready for the next weekly transfer once your bank details are on file.
                    </p>
                    {paymentDetails?.missingBankDetails ? (
                      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-amber-950 dark:text-amber-100">
                        We don&apos;t have verified bank details on file yet. Contact your coordinator or support so a
                        Paystack recipient can be set up before the next run.
                      </p>
                    ) : (
                      <p className="text-muted-foreground">
                        Your profile looks ready for transfers. If anything looks off, message support with your cleaner
                        ID.
                      </p>
                    )}
                  </div>
                  <DialogFooter>
                    <DialogTrigger asChild>
                      <Button type="button" variant="outline">
                        Close
                      </Button>
                    </DialogTrigger>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </Card>

            <Card className="rounded-2xl p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Last 7 days</p>
                <span className="text-xs text-muted-foreground">Johannesburg days</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">Tap a bar to filter the timeline to that day.</p>
              <CleanerEarningsWeeklyBarChart
                points={points}
                bestYmd={bestDay?.ymd ?? null}
                onSelectDay={(ymd) => syncChartDayToUrl(ymd)}
              />
            </Card>

            <Card className="rounded-2xl p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">Earnings timeline</p>
                <div className="flex items-center gap-2">
                  {highlightDayYmd ? (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => syncChartDayToUrl(null)}>
                      Clear day filter
                    </Button>
                  ) : null}
                  <span className="text-xs text-muted-foreground">Per job</span>
                </div>
              </div>
              {highlightDayYmd ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Showing jobs completed on{" "}
                  <span className="font-medium text-foreground">{highlightDayYmd}</span> (Johannesburg day).
                </p>
              ) : null}
              <div className="mt-3 max-h-[min(22rem,50vh)] space-y-6 overflow-y-auto pr-1">
                {timelineDays.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No completed jobs with earnings in your history yet.</p>
                ) : highlightDayYmd && timelineDaysFiltered.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No jobs on that day — pick another bar or clear the filter.</p>
                ) : (
                  timelineDaysFiltered.map((ymd) => {
                    const list = timelineByDay.get(ymd) ?? [];
                    return (
                      <div key={ymd}>
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          {dayHeading(ymd, todayY)}
                        </h3>
                        <ul className="mt-2 space-y-3">
                          {list.map((r) => {
                            const badge = bookingStatusBadgeLabel(r.booking_status);
                            const cust = r.customer_paid_cents;
                            const plat = r.platform_fee_cents;
                            const you = cents(r.amount_cents);
                            const showBreakdown = cust != null && cust > 0;
                            const earningsRowHref = `/cleaner/earnings?range=week&job=${encodeURIComponent(r.booking_id)}`;
                            return (
                              <li
                                key={r.booking_id}
                                ref={highlightJobId === r.booking_id ? highlightedRowRef : undefined}
                                className={cn(
                                  "rounded-lg border-b border-border/60 pb-3 last:border-0 last:pb-0",
                                  highlightJobId === r.booking_id ? "border border-primary/40 bg-primary/5 pb-3" : "",
                                )}
                              >
                                <div className="flex justify-between gap-3">
                                  <div className="min-w-0">
                                    <Link
                                      href={earningsRowHref}
                                      className="truncate text-sm font-medium text-primary underline-offset-4 hover:underline"
                                    >
                                      {r.service}
                                    </Link>
                                    <p className="text-xs text-muted-foreground">
                                      {jhbTimeLabel(r.completed_at)}
                                      <span className="mx-1">·</span>
                                      <span
                                        className={cn(
                                          badge.tone === "ok" && "text-emerald-700 dark:text-emerald-300",
                                          badge.tone === "warn" && "text-amber-700 dark:text-amber-300",
                                          badge.tone === "muted" && "text-muted-foreground",
                                        )}
                                      >
                                        {badge.label}
                                        {badge.tone === "ok" ? " ✓" : ""}
                                      </span>
                                    </p>
                                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{r.location}</p>
                                  </div>
                                  <span className="shrink-0 text-sm font-semibold tabular-nums">{formatZarFromCents(you)}</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                                  <Link
                                    href={`/cleaner/jobs/${encodeURIComponent(r.booking_id)}/receipt`}
                                    className="font-medium text-primary underline-offset-2 hover:underline"
                                  >
                                    View receipt
                                  </Link>
                                </div>
                                {showBreakdown ? (
                                  <details className="mt-2 rounded-lg border border-border/80 bg-muted/20 px-2 py-1.5 text-xs">
                                    <summary className="cursor-pointer font-medium text-foreground">Breakdown</summary>
                                    <dl className="mt-2 space-y-1 text-muted-foreground">
                                      <div className="flex justify-between gap-2">
                                        <dt>Client paid</dt>
                                        <dd className="tabular-nums text-foreground">{formatZarFromCents(cust!)}</dd>
                                      </div>
                                      <div className="flex justify-between gap-2">
                                        <dt title="Calculated as customer total minus your earnings; not an itemised fee invoice.">
                                          Platform &amp; fees (estimated)
                                        </dt>
                                        <dd className="tabular-nums text-foreground">
                                          {plat != null ? formatZarFromCents(plat) : "—"}
                                        </dd>
                                      </div>
                                      <div className="flex justify-between gap-2 font-semibold text-foreground">
                                        <dt>You earned</dt>
                                        <dd className="tabular-nums">{formatZarFromCents(you)}</dd>
                                      </div>
                                    </dl>
                                    {r.is_team_job ? (
                                      <p className="mt-2 text-[10px] text-muted-foreground">Team job — your share of the booking.</p>
                                    ) : null}
                                  </details>
                                ) : null}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    );
                  })
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
