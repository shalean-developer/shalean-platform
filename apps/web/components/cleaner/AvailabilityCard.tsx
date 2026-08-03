"use client";

import { useEffect, useState } from "react";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { formatZarFromCents } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

type AvailabilityCardProps = {
  receivingOffers: boolean;
  rosterIncludesToday: boolean;
  browserOnline: boolean;
  onGoAvailable: () => void;
  onGoOffline: () => void;
  availabilityBusy?: boolean;
  jobsCount?: number | null;
  jobsLabel?: string;
  ratingDisplay?: string | null;
  todayEarningsLabel?: string | null;
  idle?: boolean;
  className?: string;
};

type MonthlySummary = {
  completed_jobs?: number;
  weekly_earnings_cents?: number;
  monthly_earnings_cents?: number;
};

export function AvailabilityCard({ jobsCount, className }: AvailabilityCardProps) {
  const [summary, setSummary] = useState<MonthlySummary>({
    completed_jobs: jobsCount ?? 0,
    weekly_earnings_cents: 0,
    monthly_earnings_cents: 0,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers) return;
      const response = await cleanerAuthenticatedFetch("/api/cleaner/completed-jobs-month", {
        headers,
        cache: "no-store",
      });
      const json = (await response.json().catch(() => ({}))) as MonthlySummary;
      if (!cancelled && response.ok) {
        setSummary({
          completed_jobs:
            typeof json.completed_jobs === "number"
              ? Math.max(0, Math.round(json.completed_jobs))
              : jobsCount ?? 0,
          weekly_earnings_cents:
            typeof json.weekly_earnings_cents === "number"
              ? Math.max(0, Math.round(json.weekly_earnings_cents))
              : 0,
          monthly_earnings_cents:
            typeof json.monthly_earnings_cents === "number"
              ? Math.max(0, Math.round(json.monthly_earnings_cents))
              : 0,
        });
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [jobsCount]);

  return (
    <div
      className={cn(
        "rounded-2xl border border-gray-100 bg-white px-4 py-4 shadow-sm",
        className,
      )}
    >
      <div className="grid grid-cols-3 divide-x divide-gray-100">
        <Metric label="Completed Jobs" value={String(summary.completed_jobs ?? 0)} />
        <Metric
          label="Weekly Earning"
          value={formatZarFromCents(summary.weekly_earnings_cents ?? 0)}
        />
        <Metric
          label="Monthly Earning"
          value={formatZarFromCents(summary.monthly_earnings_cents ?? 0)}
        />
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-2 first:pl-0 last:pr-0">
      <p className="text-center text-[11px] font-medium leading-tight text-slate-400">{label}</p>
      <p className="max-w-full truncate text-base font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}
