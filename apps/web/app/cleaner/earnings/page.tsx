"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getCleanerIdHeaders } from "@/lib/cleaner/cleanerClientHeaders";

type EarningsStatus = "pending" | "approved" | "paid" | "pending_calculation";

type EarningsJob = {
  bookingId: string;
  date: string | null;
  service: string;
  payout: number | null;
  bonus: number;
  total: number | null;
  status: EarningsStatus;
  paidAt: string | null;
};

type EarningsResponse = {
  summary: {
    totalEarned: number;
    totalPaid: number;
    totalPending: number;
  };
  paymentDetails?: {
    readyForPayout: boolean;
    missingBankDetails: boolean;
  };
  jobs: EarningsJob[];
  error?: string;
};

function formatCents(cents: number): string {
  return `R${(cents / 100).toLocaleString("en-ZA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null): string {
  if (!value) return "Date pending";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function nextMondayLabel(now = new Date()): string {
  const next = new Date(now);
  const day = next.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 1;
  next.setDate(next.getDate() + daysUntilMonday);
  return `Next payout: Monday, ${next.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`;
}

function nextMondayDate(now = new Date()): Date {
  const next = new Date(now);
  const day = next.getDay();
  const daysUntilMonday = day === 1 ? 7 : (8 - day) % 7 || 1;
  next.setDate(next.getDate() + daysUntilMonday);
  next.setHours(12, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date): Date {
  const start = new Date(date);
  const day = start.getDay();
  const diff = day === 0 ? 6 : day - 1;
  start.setDate(start.getDate() - diff);
  start.setHours(0, 0, 0, 0);
  return start;
}

function weekKey(date: Date): string {
  const start = startOfWeek(date);
  return `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}-${String(start.getDate()).padStart(2, "0")}`;
}

function weekLabel(key: string, now = new Date()): string {
  const thisWeek = startOfWeek(now);
  const lastWeek = new Date(thisWeek);
  lastWeek.setDate(lastWeek.getDate() - 7);

  const thisKey = weekKey(thisWeek);
  const lastKey = weekKey(lastWeek);
  if (key === thisKey) return "This week";
  if (key === lastKey) return "Last week";

  const start = new Date(`${key}T12:00:00`);
  if (Number.isNaN(start.getTime())) return "Earlier";
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${start.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })} - ${end.toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "short",
  })}`;
}

function jobDateMs(job: EarningsJob): number {
  if (!job.date) return 0;
  const parsed = new Date(job.date).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

const statusPriority: Record<EarningsStatus, number> = {
  pending_calculation: 0,
  pending: 1,
  approved: 2,
  paid: 3,
};

function sortByPayoutRelevance(jobs: EarningsJob[]): EarningsJob[] {
  return [...jobs].sort((a, b) => {
    const byStatus = statusPriority[a.status] - statusPriority[b.status];
    if (byStatus !== 0) return byStatus;
    return jobDateMs(b) - jobDateMs(a);
  });
}

function buildWeeklyTotals(jobs: EarningsJob[]): { key: string; label: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const job of jobs) {
    if (job.total == null || !job.date) continue;
    const date = new Date(job.date);
    if (Number.isNaN(date.getTime())) continue;
    const key = weekKey(date);
    totals.set(key, (totals.get(key) ?? 0) + job.total);
  }

  return [...totals.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 6)
    .map(([key, total]) => ({ key, label: weekLabel(key), total }));
}

function totalForWeek(jobs: EarningsJob[], date: Date): number {
  const targetKey = weekKey(date);
  return jobs.reduce((sum, job) => {
    if (job.total == null || !job.date) return sum;
    const parsed = new Date(job.date);
    if (Number.isNaN(parsed.getTime()) || weekKey(parsed) !== targetKey) return sum;
    return sum + job.total;
  }, 0);
}

function trendText(thisWeek: number, lastWeek: number): string {
  if (lastWeek === 0) {
    return thisWeek > 0 ? "New earnings this week" : "No trend yet";
  }
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  if (pct === 0) return "Even with last week";
  return pct > 0 ? `Up +${pct}% vs last week` : `Down ${pct}% vs last week`;
}

export default function CleanerEarningsPage() {
  const router = useRouter();
  const [data, setData] = useState<EarningsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const headers = getCleanerIdHeaders();
    if (!headers) {
      router.replace("/cleaner/login");
      return;
    }

    try {
      const res = await fetch("/api/cleaner/earnings", { headers });
      const json = (await res.json()) as EarningsResponse;
      if (!res.ok) {
        setError(json.error ?? "Could not load earnings.");
        setData(null);
        return;
      }
      setData(json);
      setError(null);
    } catch {
      setError("Network error while loading earnings.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-8">
        <div className="h-8 w-44 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {[1, 2, 3].map((key) => (
            <div key={key} className="h-28 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
          ))}
        </div>
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/70" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/40 dark:text-rose-100">
          {error}
        </p>
      </main>
    );
  }

  const jobs = sortByPayoutRelevance(data?.jobs ?? []);
  const rawJobs = data?.jobs ?? [];
  const weeklyTotals = buildWeeklyTotals(rawJobs);
  const approvedNextPayout = rawJobs
    .filter((job) => job.status === "approved")
    .reduce((sum, job) => sum + (job.total ?? 0), 0);
  const thisWeekTotal = totalForWeek(rawJobs, new Date());
  const lastWeekDate = new Date();
  lastWeekDate.setDate(lastWeekDate.getDate() - 7);
  const lastWeekTotal = totalForWeek(rawJobs, lastWeekDate);
  const missingBankDetails = data?.paymentDetails?.missingBankDetails === true;

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Cleaner earnings</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">Your earnings</h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{nextMondayLabel()}</p>
      </header>

      {missingBankDetails ? (
        <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 shadow-sm dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Missing bank details</p>
              <p className="mt-1 text-xs opacity-90">
                Add your payment details before the next payout so we can send your earnings.
              </p>
            </div>
            <Link
              href="/cleaner/settings/payment"
              className="rounded-lg bg-amber-900 px-3 py-2 text-xs font-semibold text-white dark:bg-amber-200 dark:text-amber-950"
            >
              Add payment details
            </Link>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900 shadow-sm dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
          Ready for payout
        </section>
      )}

      <section className="sticky top-3 z-10 rounded-2xl border border-emerald-200 bg-emerald-50/95 p-4 shadow-lg backdrop-blur dark:border-emerald-900/60 dark:bg-emerald-950/90">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800 dark:text-emerald-200">
              Next payout
            </p>
            <p className="mt-1 text-sm text-emerald-900 dark:text-emerald-100">
              Monday, {nextMondayDate().toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-emerald-800 dark:text-emerald-200">Estimated</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-950 dark:text-emerald-50">
              {formatCents(approvedNextPayout)}
            </p>
          </div>
        </div>
        <p className="mt-3 text-xs text-emerald-800 dark:text-emerald-200">
          Approved jobs are expected to be paid on Monday. {trendText(thisWeekTotal, lastWeekTotal)}.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard title="Total earned" value={data?.summary.totalEarned ?? 0} />
        <SummaryCard title="Paid" value={data?.summary.totalPaid ?? 0} />
        <SummaryCard title="Pending" value={data?.summary.totalPending ?? 0} />
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Total per week</h2>
        {weeklyTotals.length === 0 ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Weekly totals appear after calculated payouts.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {weeklyTotals.map((week) => (
              <div key={week.key} className="flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-zinc-700 dark:text-zinc-200">{week.label}</span>
                <span className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatCents(week.total)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Completed jobs</h2>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:text-zinc-200"
          >
            Refresh
          </button>
        </div>

        {jobs.length === 0 ? (
          <div className="rounded-2xl border border-zinc-200 bg-white px-4 py-10 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">No earnings yet</p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Completed jobs will appear here once payout calculation runs.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {jobs.map((job) => (
              <JobRow key={job.bookingId} job={job} />
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function SummaryCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-sm text-zinc-500 dark:text-zinc-400">{title}</div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{formatCents(value)}</div>
    </div>
  );
}

function JobRow({ job }: { job: EarningsJob }) {
  return (
    <li className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-medium text-zinc-900 dark:text-zinc-50">{job.service}</div>
          <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{formatDate(job.date)}</div>
          {job.status === "pending_calculation" ? (
            <div className="mt-2 inline-flex rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              ⚠️ Needs review
            </div>
          ) : null}
          {job.bonus > 0 && job.total != null ? (
            <div className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
              + {formatCents(job.bonus)} bonus
            </div>
          ) : null}
        </div>

        <div className="text-right">
          {job.total == null ? (
            <div className="font-semibold text-amber-700 dark:text-amber-300">Pending calculation</div>
          ) : (
            <div className="font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{formatCents(job.total)}</div>
          )}
          <StatusBadge status={job.status} />
          {job.status === "paid" && job.paidAt ? (
            <div className="mt-1 text-xs text-zinc-400">Paid {formatDate(job.paidAt)}</div>
          ) : null}
          {job.status === "approved" ? (
            <div className="mt-1 text-xs text-blue-700 dark:text-blue-300">
              Expected payout {formatDate(nextMondayDate().toISOString())}
            </div>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function StatusBadge({ status }: { status: EarningsStatus }) {
  const styles: Record<EarningsStatus, string> = {
    pending: "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200",
    approved: "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200",
    paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
    pending_calculation: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200",
  };
  const labels: Record<EarningsStatus, string> = {
    pending: "Pending",
    approved: "Approved",
    paid: "Paid",
    pending_calculation: "Pending calculation",
  };

  return (
    <div className={`mt-2 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${styles[status]}`}>
      {labels[status]}
    </div>
  );
}
