"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerJobAction, PostJobActionResult } from "@/hooks/useCleanerMobileWorkspace";
import { useCleanerPayoutSummary } from "@/hooks/useCleanerPayoutSummary";
import type { CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";
import { CleanerJobCard } from "@/components/cleaner/mobile/dashboard/CleanerJobCard";
import { EarningsCard } from "@/components/cleaner/mobile/dashboard/EarningsCard";

type Props = {
  loading: boolean;
  error: string | null;
  activeJob: CleanerMobileJobView | null;
  nextJob: CleanerMobileJobView | null;
  hasAnyJob: boolean;
  actingId: string | null;
  teamAvailabilityAckIds: Set<string>;
  onJobAction: (
    bookingId: string,
    action: CleanerJobAction,
    opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string },
  ) => Promise<PostJobActionResult>;
  todayPotentialZar: number;
  todayPotentialHasGap: boolean;
  weekEarnedZar: number;
  monthEarnedZar: number;
  highlightJobId: string | null;
  cleanerRating: number | null;
  onViewEarnings?: () => void;
};

export function CleanerDashboardHome({
  loading,
  error,
  activeJob,
  nextJob,
  hasAnyJob,
  actingId,
  teamAvailabilityAckIds,
  onJobAction,
  todayPotentialZar,
  todayPotentialHasGap,
  weekEarnedZar,
  monthEarnedZar,
  highlightJobId,
  cleanerRating,
  onViewEarnings,
}: Props) {
  void cleanerRating;
  const payout = useCleanerPayoutSummary();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-40 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
        <div className="h-72 animate-pulse rounded-2xl bg-zinc-200/70 dark:bg-zinc-800/80" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="rounded-2xl border-rose-200 shadow-sm dark:border-rose-900/50">
        <CardContent className="p-4 text-sm text-rose-800 dark:text-rose-200">{error}</CardContent>
      </Card>
    );
  }

  const job = activeJob ?? nextJob;
  const variant = activeJob ? "active" : "next";

  return (
    <div className="space-y-4">
      <EarningsCard
        loading={payout.loading}
        eligibleCents={payout.summary?.eligible_cents ?? 0}
        todayZar={todayPotentialZar}
        weekZar={weekEarnedZar}
        monthZar={monthEarnedZar}
        hasGap={todayPotentialHasGap}
        missingBankDetails={payout.missingBankDetails}
        onViewEarnings={onViewEarnings ?? (() => {})}
      />
      {job ? (
        <CleanerJobCard
          job={job}
          variant={variant}
          actingId={actingId}
          availabilityAcked={teamAvailabilityAckIds.has(job.id)}
          highlightPulse={highlightJobId != null && highlightJobId === job.id}
          nowMs={nowMs}
          onJobAction={onJobAction}
        />
      ) : !hasAnyJob ? (
        <Card className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
              <Sparkles className="h-7 w-7 text-blue-600 dark:text-blue-400" aria-hidden />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No assigned jobs</h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                When dispatch assigns you a visit, it appears here immediately.
              </p>
            </div>
            <Badge variant="outline">Live roster</Badge>
          </CardContent>
        </Card>
      ) : (
        <Card className="rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
          <CardContent className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            No upcoming jobs in your schedule.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
