"use client";

import type { ReactNode } from "react";
import { Briefcase, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CleanerOffersPanel } from "@/components/cleaner/mobile/CleanerOffersPanel";
import { CleanerJobCard } from "@/components/cleaner/mobile/dashboard/CleanerJobCard";
import type { CleanerHomeJobFilter } from "@/components/cleaner/mobile/dashboard/CleanerHomeStatusStrip";
import type { CleanerJobAction, PostJobActionResult } from "@/hooks/useCleanerMobileWorkspace";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { bookingRowToMobileView } from "@/lib/cleaner/cleanerMobileBookingMap";
import {
  filterActiveJobs,
  filterCompletedJobs,
  filterNewJobsNeedingResponse,
} from "@/lib/cleaner/cleanerDashboardBookingBuckets";
import { earliestOpenBookingId } from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";
import { cn } from "@/lib/utils";

function sortByScheduleAsc(rows: CleanerBookingRow[]): CleanerBookingRow[] {
  return [...rows].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return da.localeCompare(db);
    const ta = a.time ?? "";
    const tb = b.time ?? "";
    return ta.localeCompare(tb);
  });
}

function sortCompletedDesc(rows: CleanerBookingRow[]): CleanerBookingRow[] {
  return [...rows].sort((a, b) => {
    const ca = a.completed_at ?? "";
    const cb = b.completed_at ?? "";
    if (ca !== cb) return cb.localeCompare(ca);
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return db.localeCompare(da);
    return (b.time ?? "").localeCompare(a.time ?? "");
  });
}

type Props = {
  loading: boolean;
  rows: CleanerBookingRow[];
  nowMs: number;
  /** From `/api/cleaner/me` — when exactly `0`, show first-time welcome in the empty roster state. */
  jobsCompleted?: number;
  rankedSoloOffers: CleanerOfferRow[];
  extraSoloOffersTodayCount: number;
  offerActingId: string | null;
  onAcceptOffer: (offerId: string, uxVariant?: string | null) => Promise<boolean>;
  onDeclineOffer: (offerId: string) => Promise<void>;
  onOfferAcceptedUi: (bookingId: string) => void;
  teamAvailabilityAckIds: Set<string>;
  actingId: string | null;
  onJobAction: (
    bookingId: string,
    action: CleanerJobAction,
    opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string },
  ) => Promise<PostJobActionResult>;
  /** @deprecated Kept for parent compatibility; job card no longer shows rating. */
  cleanerRating: number;
  onIssueReportSuccess?: () => void;
  /** When false, copy explains how to receive offers again. */
  isAvailable?: boolean;
  /** Home strip filter: which bucket to show below. */
  jobFilter: CleanerHomeJobFilter;
  /** From `/api/cleaner/me` `created_at` — UX-only pay hints when display earnings are missing. */
  cleanerCreatedAtIso?: string | null;
};

function JobCardsOnly({
  rows,
  actingId,
  teamAvailabilityAckIds,
  onJobAction,
  onIssueReportSuccess,
  variantClassName,
  nextJobCalloutId,
  cleanerCreatedAtIso,
  nowMs,
}: {
  rows: CleanerBookingRow[];
  actingId: string | null;
  teamAvailabilityAckIds: Set<string>;
  onJobAction: Props["onJobAction"];
  onIssueReportSuccess?: () => void;
  variantClassName?: string;
  /** Earliest open job (JHB sort) — “Next job” badge. */
  nextJobCalloutId?: string | null;
  cleanerCreatedAtIso?: string | null;
  nowMs: number;
}) {
  const views = rows.map((r) => bookingRowToMobileView(r));
  const activeId = views.find((v) => v.phase === "in_progress")?.id ?? null;

  return (
    <div id="cleaner-work-status" className={cn("space-y-4", variantClassName)}>
      {views.map((job) => (
        <CleanerJobCard
          key={job.id}
          job={job}
          variant={activeId && job.id === activeId ? "active" : "next"}
          actingId={actingId}
          availabilityAcked={teamAvailabilityAckIds.has(job.id)}
          showNextJobCallout={Boolean(nextJobCalloutId && job.id === nextJobCalloutId)}
          cleanerCreatedAtIso={cleanerCreatedAtIso}
          nowMs={nowMs}
          onJobAction={onJobAction}
          onIssueReportSuccess={onIssueReportSuccess}
        />
      ))}
    </div>
  );
}

function EmptyWork({ children }: { children: ReactNode }) {
  return (
    <div
      id="cleaner-work-status"
      className="rounded-xl border border-zinc-200/90 bg-zinc-50/80 px-3 py-4 text-center text-sm text-zinc-600 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-400"
    >
      {children}
    </div>
  );
}

export function CleanerWorkStatusCard({
  loading,
  rows,
  nowMs,
  jobsCompleted,
  rankedSoloOffers,
  extraSoloOffersTodayCount,
  offerActingId,
  onAcceptOffer,
  onDeclineOffer,
  onOfferAcceptedUi,
  teamAvailabilityAckIds,
  actingId,
  onJobAction,
  cleanerRating: _cleanerRating,
  onIssueReportSuccess,
  isAvailable = true,
  jobFilter,
  cleanerCreatedAtIso,
}: Props) {
  if (loading) {
    return (
      <div
        id="cleaner-work-status"
        className="flex flex-col items-center justify-center rounded-2xl border border-zinc-200/80 bg-white p-8 dark:border-zinc-700 dark:bg-zinc-900/50"
        aria-busy="true"
        aria-live="polite"
      >
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" aria-hidden />
        <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">Loading jobs…</p>
      </div>
    );
  }

  if (!isAvailable) {
    const activeN = filterActiveJobs(rows).length;
    return (
      <Card
        id="cleaner-work-status"
        className="rounded-2xl border border-zinc-200/95 bg-zinc-50/50 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50"
      >
        <CardContent className="space-y-3 p-5 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-200/80 dark:bg-zinc-800">
            <Briefcase className="h-6 w-6 text-zinc-500 dark:text-zinc-400" aria-hidden />
          </div>
          <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">Availability is off</p>
          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            You won&apos;t receive new job offers until you turn availability on in Profile.
          </p>
          {activeN > 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">You still have active jobs on your roster.</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const newJobRows = sortByScheduleAsc(filterNewJobsNeedingResponse(rows));
  const activeJobRows = sortByScheduleAsc(filterActiveJobs(rows));
  const completedJobRows = sortCompletedDesc(filterCompletedJobs(rows));

  if (jobFilter === "new") {
    const hasOffers = rankedSoloOffers.length > 0;
    const hasAssigned = newJobRows.length > 0;
    if (!hasOffers && !hasAssigned) {
      return (
        <EmptyWork>
          <span className="block font-medium text-zinc-800 dark:text-zinc-200">No new jobs available</span>
          <span className="mt-1 block text-zinc-600 dark:text-zinc-400">
            Assigned jobs needing a response and offer-pool jobs will show here.
          </span>
        </EmptyWork>
      );
    }
    return (
      <div
        id="cleaner-work-status"
        className="space-y-4 rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80"
      >
        {hasOffers ? (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Offer pool</h2>
            <div className="mt-3">
              <CleanerOffersPanel
                rankedSoloOffers={rankedSoloOffers}
                busy={Boolean(offerActingId)}
                busyOfferId={offerActingId}
                cleanerCreatedAtIso={cleanerCreatedAtIso}
                moreJobsTodayCount={extraSoloOffersTodayCount}
                hideSectionHeading
                onAccept={onAcceptOffer}
                onDecline={onDeclineOffer}
                onAcceptSuccess={onOfferAcceptedUi}
              />
            </div>
          </div>
        ) : null}
        {hasAssigned ? (
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Assigned — respond
            </h2>
            <div className="mt-3">
              <JobCardsOnly
                rows={newJobRows}
                actingId={actingId}
                teamAvailabilityAckIds={teamAvailabilityAckIds}
                nextJobCalloutId={earliestOpenBookingId(newJobRows)}
                nowMs={nowMs}
                cleanerCreatedAtIso={cleanerCreatedAtIso}
                onJobAction={onJobAction}
                onIssueReportSuccess={onIssueReportSuccess}
              />
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  if (jobFilter === "active") {
    if (activeJobRows.length > 0) {
      return (
        <JobCardsOnly
          rows={activeJobRows}
          actingId={actingId}
          teamAvailabilityAckIds={teamAvailabilityAckIds}
          nextJobCalloutId={earliestOpenBookingId(activeJobRows)}
          nowMs={nowMs}
          cleanerCreatedAtIso={cleanerCreatedAtIso}
          onJobAction={onJobAction}
          onIssueReportSuccess={onIssueReportSuccess}
        />
      );
    }
    if (typeof jobsCompleted === "number" && jobsCompleted === 0) {
      return (
        <div
          id="cleaner-work-status"
          className="rounded-2xl border border-zinc-200/90 bg-white p-5 text-center shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80"
        >
          <p className="text-2xl" aria-hidden>
            👋
          </p>
          <p className="mt-3 text-base font-semibold text-zinc-900 dark:text-zinc-50">Welcome</p>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
            You&apos;ll see active jobs here once you accept an assignment.
          </p>
        </div>
      );
    }
    return (
      <EmptyWork>
        <span className="block font-medium text-zinc-800 dark:text-zinc-200">No active jobs</span>
        <span className="mt-1 block text-zinc-600 dark:text-zinc-400">Check New for assignments and offers.</span>
      </EmptyWork>
    );
  }

  if (jobFilter === "past") {
    if (completedJobRows.length > 0) {
      return (
        <JobCardsOnly
          rows={completedJobRows}
          actingId={actingId}
          teamAvailabilityAckIds={teamAvailabilityAckIds}
          nextJobCalloutId={null}
          nowMs={nowMs}
          cleanerCreatedAtIso={cleanerCreatedAtIso}
          onJobAction={onJobAction}
          onIssueReportSuccess={onIssueReportSuccess}
        />
      );
    }
    return (
      <EmptyWork>
        <span className="block font-medium text-zinc-800 dark:text-zinc-200">No completed jobs yet</span>
        <span className="mt-1 block text-zinc-600 dark:text-zinc-400">Completed visits will show here.</span>
      </EmptyWork>
    );
  }

  return null;
}
