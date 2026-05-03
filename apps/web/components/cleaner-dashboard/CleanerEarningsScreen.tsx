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
import { cleanerDisplayFirstName } from "@/lib/cleaner/cleanerDisplayFirstName";
import { cn } from "@/lib/utils";
import { CleanerDashboardInfoHint } from "./CleanerDashboardInfoHint";
import { Header } from "./Header";
import { CleanerEarningsWeeklyBarChart } from "./CleanerEarningsWeeklyBarChart";

const EMPTY_EARNINGS_ROWS: CleanerEarningsRowWire[] = [];

type EarningsJson = {
  error?: string;
  /** Server snapshot time for this payload (ISO 8601). */
  as_of?: string;
  source_of_truth?: "booking" | "ledger";
  use_ledger_totals?: boolean;
  /** Server-computed go/no-go for ledger summary flip (shadow gates). */
  earnings_ledger_flip_ready?: boolean;
  finance_shadow?: {
    booking_ids_in_slice: number;
    delta_all_cents: number;
    delta_direction?: "card_minus_ledger";
    bucket_aligned: boolean;
    shadow_mismatch: boolean;
    missing_ledger_expected_count: number;
    missing_ledger_expected_count_soft?: number;
    missing_ledger_expected_count_hard?: number;
    bucket_mapping_mismatch_count?: number;
    summary?: {
      ok?: boolean;
      buckets?: { pending_delta?: number; eligible_delta?: number; paid_delta?: number };
    };
    jhb_week?: unknown;
  };
  cutoff_assignment_probe?: {
    mismatch?: boolean;
    ui_payout_target_friday_ymd?: string;
    batch_pay_friday_jhb_ymd?: string;
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
  cleaner?: { full_name?: string | null };
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

  const { jobs: jobsToday } = useMemo(() => countJobsAndCentsForToday(rows, todayY), [rows, todayY]);
  const jobsWeek = useMemo(() => countJobsInWeek(rows, todayY, weekStart), [rows, todayY, weekStart]);

  const lastInPeriod = useMemo(
    () => lastJobInPeriod(rows, period, todayY, weekStart, monthPrefix),
    [rows, period, todayY, weekStart, monthPrefix],
  );
  const lastJobCents = lastInPeriod ? cents(lastInPeriod.amount_cents) : 0;

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

  const overviewVisibleLines = useMemo(() => {
    const out: string[] = [];
    const msg = momentum.message;
    if (msg) {
      if (msg.includes("ahead of last week")) {
        out.push("You're ahead of last week 👍");
      } else {
        out.push(msg);
      }
    }
    if (out.length < 2 && jobsToGoal != null && jobsToGoal > 0 && goalAmt > 0) {
      out.push(`${jobsToGoal} more ${jobsToGoal === 1 ? "job" : "jobs"} to reach today's goal.`);
    }
    return out.slice(0, 2);
  }, [momentum.message, jobsToGoal, goalAmt]);

  const overviewTooltipDetail = useMemo(() => {
    const chunks: string[] = [];
    if (momentum.recoveryHint) chunks.push(momentum.recoveryHint);
    if (projectionUnderWeekGoal) {
      chunks.push(
        "At this week's pace you're under a full-week goal at your dashboard target — one more completed job soon lifts the projection.",
      );
    }
    if (period === "week" && projectedWeek > 0) {
      chunks.push(`On track for about ${formatZarFromCents(projectedWeek)} this week if your pace holds.`);
    }
    if (bestDay && bestDay.cents > 0 && period === "week") {
      chunks.push(`Best day (7d): ${bestDay.label} · ${formatZarFromCents(bestDay.cents)}`);
    }
    for (const m of insightMessages) {
      if (!chunks.includes(m)) chunks.push(m);
    }
    return chunks.slice(0, 8).join("\n\n");
  }, [
    momentum.recoveryHint,
    projectionUnderWeekGoal,
    period,
    projectedWeek,
    bestDay,
    insightMessages,
  ]);

  const showOverviewSection = overviewVisibleLines.length > 0 || overviewTooltipDetail.length > 0;

  const hasRows = rows.length > 0;
  const showEmpty = !loading && !error && !hasRows;

  const headerFirstName = useMemo(
    () => cleanerDisplayFirstName(payload?.cleaner?.full_name),
    [payload?.cleaner?.full_name],
  );

  const payoutHeadlineShort = useMemo(() => {
    const h = payoutArrival.headline;
    const i = h.indexOf("—");
    return i === -1 ? h : h.slice(0, i).trim();
  }, [payoutArrival.headline]);

  return (
    <div className="mx-auto w-full max-w-lg bg-background">
      <div className="space-y-4 p-4">
        <Header firstName={headerFirstName} />
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
              <div className="flex items-center gap-1">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {periodLabel} earnings
                </p>
                <CleanerDashboardInfoHint
                  label={`About ${periodLabel} earnings`}
                  text={
                    (period === "today"
                      ? "Shows earnings from jobs completed today.\n\nUpdates after each completed job."
                      : period === "week"
                        ? "Shows earnings from jobs completed this week (SAST).\n\nUpdates when you finish a job."
                        : "Shows earnings from jobs completed this month (SAST).\n\nUpdates when you finish a job.") +
                    `\n\nTotals use South African time (SAST). Data refreshes about every minute while this page is open.` +
                    (updatedAgoLabel ? ` ${updatedAgoLabel}.` : "")
                  }
                  className="-translate-y-px"
                />
              </div>
              <p className="mt-1 text-3xl font-bold tabular-nums tracking-tight text-foreground">{formatZarFromCents(periodAmt)}</p>
              {lastJobCents > 0 ? (
                <p className="mt-1 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  +{formatZarFromCents(lastJobCents)} from last job
                </p>
              ) : period === "today" ? (
                <p className="mt-1 text-sm text-muted-foreground">No earnings yet today</p>
              ) : period === "week" ? (
                <p className="mt-1 text-sm text-muted-foreground">No earnings this week yet</p>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground">No earnings this month yet</p>
              )}
              <div className="mt-4 flex w-full items-end gap-2">
                <Tabs value={period} onValueChange={(v) => syncRangeToUrl(v as EarningsPeriod)} className="min-w-0 flex-1">
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
                <CleanerDashboardInfoHint
                  label="About period tabs"
                  text="Switch between your earnings for today, this week, or this month."
                  className="pb-0.5"
                />
              </div>
            </Card>
          </div>

          <div className="space-y-4 px-4 pt-4" aria-labelledby="earnings-body-heading">
            <h2 id="earnings-body-heading" className="sr-only">
              Earnings
            </h2>
            {showOverviewSection ? (
              <>
                <div className="flex items-center gap-1.5">
                  <h3 className="text-lg font-semibold text-foreground">Overview</h3>
                  <CleanerDashboardInfoHint
                    label="About overview"
                    text={
                      "Summary of your recent performance, goals, and payout status." +
                      (overviewTooltipDetail ? `\n\n${overviewTooltipDetail}` : "")
                    }
                  />
                </div>
                {overviewVisibleLines.length > 0 ? (
                  <ul className="space-y-1.5 rounded-xl border border-border bg-muted/30 px-3 py-3 text-sm text-foreground">
                    {overviewVisibleLines.map((line, i) => (
                      <li key={`${i}-${line}`} className="font-medium text-foreground">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}

            {goalAmt > 0 ? (
              <Card className="rounded-2xl p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <p className="text-sm font-medium text-foreground">Daily goal</p>
                    <CleanerDashboardInfoHint
                      label="About daily goal"
                      text="Estimated target based on your recent 7-day performance."
                    />
                  </div>
                  <p className="shrink-0 text-xl font-bold tabular-nums tracking-tight text-foreground">
                    {formatZarFromCents(goalAmt)}
                  </p>
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  <span className="font-semibold tabular-nums text-foreground">{formatZarFromCents(todayAmt)}</span>{" "}
                  earned today
                </p>
              </Card>
            ) : null}

            <Card className="rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-foreground">Payouts</p>
                <CleanerDashboardInfoHint
                  label="How payouts work"
                  text={
                    "Your earnings are paid weekly.\n\n" +
                    "Jobs must be completed before Thursday 23:59 SAST to be included in the next payout.\n\n" +
                    "Available pays on the next weekly batch once your bank details are ready. " +
                    "Processing includes amounts still finalising or locked in a batch.\n\n" +
                    payoutArrival.sub
                  }
                />
              </div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <span className="text-muted-foreground">Available</span>
                  <span className="font-semibold tabular-nums text-foreground">{formatZarFromCents(availableForPayout)}</span>
                </div>
                <p className="text-xs font-medium text-emerald-800 dark:text-emerald-200">{payoutHeadlineShort}</p>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span className="inline-flex min-w-0 items-center gap-1">
                    <span>Processing</span>
                    <CleanerDashboardInfoHint
                      label="About processing"
                      text="These earnings are being reviewed and will be included in your next payout."
                    />
                  </span>
                  <span className="tabular-nums text-foreground">{formatZarFromCents(processingPipeline)}</span>
                </div>
                <div className="flex justify-between gap-3 text-muted-foreground">
                  <span>Paid</span>
                  <span className="tabular-nums text-foreground">{formatZarFromCents(paidWeek)}</span>
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
              <div className="flex items-center gap-1">
                <p className="text-sm font-semibold text-foreground">Last 7 days</p>
                <CleanerDashboardInfoHint
                  label="About last 7 days chart"
                  text="Tap a bar to view earnings for that specific day."
                />
              </div>
              <div className="mt-3">
                <CleanerEarningsWeeklyBarChart
                  points={points}
                  bestYmd={bestDay?.ymd ?? null}
                  onSelectDay={(ymd) => syncChartDayToUrl(ymd)}
                />
              </div>
            </Card>

            <Card className="rounded-2xl p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <p className="text-sm font-semibold text-foreground">Earnings timeline</p>
                  <CleanerDashboardInfoHint
                    label="About earnings timeline"
                    text="List of completed jobs and how much you earned from each."
                  />
                </div>
                <div className="flex items-center gap-2">
                  {highlightDayYmd ? (
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={() => syncChartDayToUrl(null)}>
                      Clear day filter
                    </Button>
                  ) : null}
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
                            const you = cents(r.amount_cents);
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
                                  <div className="shrink-0 text-right">
                                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">You earned</p>
                                    <p className="text-sm font-semibold tabular-nums text-foreground">{formatZarFromCents(you)}</p>
                                  </div>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
                                  <Link
                                    href={`/cleaner/jobs/${encodeURIComponent(r.booking_id)}/receipt`}
                                    className="font-medium text-primary underline-offset-2 hover:underline"
                                  >
                                    View receipt
                                  </Link>
                                </div>
                                {r.is_team_job ? (
                                  <p className="mt-2 text-[10px] text-muted-foreground">Team job — your share of the booking.</p>
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
