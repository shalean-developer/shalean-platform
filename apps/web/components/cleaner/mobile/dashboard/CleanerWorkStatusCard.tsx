"use client";

import type { ReactNode } from "react";
import { Briefcase } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CleanerOffersPanel } from "@/components/cleaner/mobile/CleanerOffersPanel";
import { CleanerJobCard } from "@/components/cleaner/mobile/dashboard/CleanerJobCard";
import type { CleanerHomeJobFilter } from "@/components/cleaner/mobile/dashboard/CleanerHomeStatusStrip";
import type { CleanerJobAction, PostJobActionResult } from "@/hooks/useCleanerMobileWorkspace";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { bookingRowToMobileView, groupCleanerScheduleRows } from "@/lib/cleaner/cleanerMobileBookingMap";
import { earliestOpenBookingId } from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";
import { cn } from "@/lib/utils";

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

function dedupeRowsById(list: CleanerBookingRow[]): CleanerBookingRow[] {
  const m = new Map<string, CleanerBookingRow>();
  for (const r of list) {
    const id = String(r.id ?? "").trim();
    if (id) m.set(id, r);
  }
  return [...m.values()];
}

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
      <div id="cleaner-work-status" className="rounded-2xl border border-zinc-200/80 bg-white p-4 dark:border-zinc-700 dark:bg-zinc-900/50" aria-hidden>
        <div className="h-3 w-36 animate-pulse rounded bg-zinc-200 dark:bg-zinc-700" />
        <div className="mt-4 h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800/80" />
      </div>
    );
  }

  if (!isAvailable) {
    const { sections } = groupCleanerScheduleRows(rows, new Date(nowMs));
    const upcomingN = (sections.find((s) => s.key === "upcoming")?.rows ?? []).length;
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
          {upcomingN > 0 ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">You still have upcoming visits on your roster.</p>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  const { sections } = groupCleanerScheduleRows(rows, new Date(nowMs));
  const todayRows = sections.find((s) => s.key === "today")?.rows ?? [];
  const overdueRows = sections.find((s) => s.key === "overdue")?.rows ?? [];
  const upcomingRows = sections.find((s) => s.key === "upcoming")?.rows ?? [];
  const todayAndOverdue = dedupeRowsById([...overdueRows, ...todayRows]);
  const nextJobInTodayBucket = earliestOpenBookingId(todayAndOverdue);
  const nextJobInUpcomingBucket = earliestOpenBookingId(upcomingRows);
  const pastRows = sections.find((s) => s.key === "completed")?.rows ?? [];

  if (jobFilter === "new") {
    if (rankedSoloOffers.length > 0) {
      return (
        <div
          id="cleaner-work-status"
          className="rounded-2xl border border-zinc-200/90 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80"
        >
          <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">New jobs available</h2>
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
      );
    }
    return <EmptyWork>No new offers right now.</EmptyWork>;
  }

  if (jobFilter === "today") {
    if (todayAndOverdue.length > 0) {
      return (
        <JobCardsOnly
          rows={todayAndOverdue}
          actingId={actingId}
          teamAvailabilityAckIds={teamAvailabilityAckIds}
          nextJobCalloutId={nextJobInTodayBucket}
          nowMs={nowMs}
          cleanerCreatedAtIso={cleanerCreatedAtIso}
          onJobAction={onJobAction}
          onIssueReportSuccess={onIssueReportSuccess}
          variantClassName={
            overdueRows.length > 0
              ? "rounded-2xl border border-amber-200/90 bg-amber-50/20 p-3 dark:border-amber-900/40 dark:bg-amber-950/15"
              : undefined
          }
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
            You&apos;ll see jobs here once you&apos;re assigned.
          </p>
        </div>
      );
    }
    return (
      <EmptyWork>
        <span className="block font-medium text-zinc-800 dark:text-zinc-200">No jobs yet today</span>
        <span className="mt-1 block text-zinc-600 dark:text-zinc-400">Check offers to start earning</span>
      </EmptyWork>
    );
  }

  if (jobFilter === "upcoming") {
    if (upcomingRows.length > 0) {
      return (
        <JobCardsOnly
          rows={upcomingRows}
          actingId={actingId}
          teamAvailabilityAckIds={teamAvailabilityAckIds}
          nextJobCalloutId={nextJobInUpcomingBucket}
          nowMs={nowMs}
          cleanerCreatedAtIso={cleanerCreatedAtIso}
          onJobAction={onJobAction}
          onIssueReportSuccess={onIssueReportSuccess}
        />
      );
    }
    return (
      <EmptyWork>
        <span className="block font-medium text-zinc-800 dark:text-zinc-200">No upcoming jobs</span>
        <span className="mt-1 block text-zinc-600 dark:text-zinc-400">Check offers to keep earning</span>
      </EmptyWork>
    );
  }

  if (jobFilter === "past") {
    if (pastRows.length > 0) {
      return (
        <JobCardsOnly
          rows={pastRows}
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
        <span className="block font-medium text-zinc-800 dark:text-zinc-200">No past jobs yet</span>
        <span className="mt-1 block text-zinc-600 dark:text-zinc-400">
          Completed and cancelled visits will show here.
        </span>
      </EmptyWork>
    );
  }

  return null;
}
