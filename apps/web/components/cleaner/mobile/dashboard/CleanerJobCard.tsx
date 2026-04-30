"use client";

import Link from "next/link";
import { ChevronRight, FileText, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CleanerReportJobIssueDialog } from "@/components/cleaner/CleanerReportJobIssueDialog";
import type { CleanerJobAction } from "@/hooks/useCleanerMobileWorkspace";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import {
  deriveCleanerJobLifecycleSlot,
  formatApproxJobDurationJobLabel,
  type CleanerMobileJobView,
} from "@/lib/cleaner/cleanerMobileBookingMap";
import { scheduleLineRich } from "@/lib/cleaner/cleanerJobCardFormat";
import { formatCleanerAvailabilityConfirmedMessage } from "@/lib/cleaner/cleanerAvailabilityConfirmedCopy";
import { teamSelfAvailabilityChip } from "@/lib/cleaner/teamAvailabilityUi";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";
import { cleanerUxEstimatedPayZar, formatCleanerUxEstimatedPayRangeLabel } from "@/lib/cleaner/cleanerUxEstimatedPayZar";
import { formatZarFromCents, formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import {
  formatUpcomingSchedulePrimaryTimeLine,
  minutesUntilJobStartJohannesburg,
  resolveInProgressPrimaryCta,
  resolveUpcomingPrimaryCta,
  upcomingScheduleStatusChip,
  upcomingScheduleStatusChipLabel,
  upcomingTravelMicroNudge,
} from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeTone } from "@/components/cleaner/mobile/dashboard/StatusBadge";

function chipToTone(variant: "confirmed" | "on_job" | "pending"): StatusBadgeTone {
  if (variant === "confirmed") return "emerald";
  if (variant === "on_job") return "sky";
  return "amber";
}

function scheduleChipClassName(chip: ReturnType<typeof upcomingScheduleStatusChip>): string {
  if (chip === "late") return "border-rose-300/90 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100";
  if (chip === "starting_soon" || chip === "in_progress") {
    return "border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100";
  }
  return "border-zinc-300/90 bg-zinc-100/90 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-100";
}

type Props = {
  job: CleanerMobileJobView;
  variant: "active" | "next";
  actingId: string | null;
  availabilityAcked: boolean;
  highlightPulse?: boolean;
  /** Earliest open job on roster — shows “Next job” and subtle emphasis. */
  showNextJobCallout?: boolean;
  /** From `/api/cleaner/me` `created_at` — heuristic pay when display earnings are missing. */
  cleanerCreatedAtIso?: string | null;
  /** @deprecated Unused; kept so callers need not churn. */
  cleanerRating?: number | null;
  /** Wall clock for JHB buckets; defaults to `Date.now()` when omitted. */
  nowMs?: number;
  onJobAction: (
    bookingId: string,
    action: CleanerJobAction,
    opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string },
  ) => Promise<void>;
  onIssueReportSuccess?: () => void;
};

export function CleanerJobCard({
  job,
  variant: _variant,
  actingId,
  availabilityAcked,
  highlightPulse,
  showNextJobCallout = false,
  cleanerCreatedAtIso = null,
  nowMs,
  onJobAction,
  onIssueReportSuccess,
}: Props) {
  const now = new Date(nowMs ?? Date.now());
  const busy = actingId === job.id;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`;
  const serverAccepted = String(job.cleanerResponseStatus ?? "")
    .trim()
    .toLowerCase() === "accepted";
  const teamChip = job.isTeamJob ? teamSelfAvailabilityChip(job.phase, serverAccepted, availabilityAcked) : null;

  const earningsCents = job.earningsCents;
  const hasResolvedEarnings = earningsCents != null;
  const uxPay = !hasResolvedEarnings ? cleanerUxEstimatedPayZar(cleanerCreatedAtIso, job.jobTotalZar, now) : null;
  const showUxExact = !hasResolvedEarnings && uxPay?.kind === "exact";
  const showUxRange = !hasResolvedEarnings && uxPay?.kind === "range";
  const effectiveCentsForPerHour =
    hasResolvedEarnings && earningsCents != null
      ? earningsCents
      : showUxExact && uxPay
        ? Math.round(uxPay.zar * 100)
        : null;
  const hasPayForRate = effectiveCentsForPerHour != null && effectiveCentsForPerHour > 0;
  const jobDurationLine =
    hasPayForRate && job.durationHours > 0 && Number.isFinite(job.durationHours)
      ? formatApproxJobDurationJobLabel(job.durationHours)
      : null;

  const suburb = suburbFromLocationForOffer(job.address);

  const rowForLifecycle = {
    id: job.id,
    status: job.statusRaw,
    date: job.date,
    time: job.time,
    location: null,
    service: job.service,
    customer_name: null,
    customer_phone: null,
    en_route_at: job.enRouteAt ?? null,
    cleaner_id: job.cleanerId ?? null,
    is_team_job: job.isTeamJob,
    cleaner_response_status: job.cleanerResponseStatus ?? null,
  } as CleanerBookingRow;

  const lifecycleSlot = deriveCleanerJobLifecycleSlot(rowForLifecycle);

  const isPast = job.phase === "completed";
  const isInProgress = job.phase === "in_progress";
  const useScheduleUx = !isPast && !isInProgress;

  const minutesUntil = useScheduleUx || isInProgress ? minutesUntilJobStartJohannesburg(job.date, job.time, now) : null;
  const primaryTimeLine =
    useScheduleUx || isInProgress
      ? formatUpcomingSchedulePrimaryTimeLine(job.date, job.time, now)
      : scheduleLineRich(job);

  const statusChipKind = upcomingScheduleStatusChip(rowForLifecycle, minutesUntil);
  const statusChipLabel = upcomingScheduleStatusChipLabel(statusChipKind);
  const microNudge = useScheduleUx ? upcomingTravelMicroNudge(minutesUntil) : null;

  const acceptPrimary =
    lifecycleSlot?.kind === "accept_reject"
      ? job.isTeamJob
        ? {
            action: "accept" as const,
            label: "Confirm availability",
            opts: {
              teamAvailabilityConfirm: true as const,
              scheduleSummary: formatCleanerAvailabilityConfirmedMessage(job.date, job.time),
            },
          }
        : { action: "accept" as const, label: "Acknowledge" }
      : null;

  const postAcceptCta =
    lifecycleSlot && lifecycleSlot.kind !== "accept_reject"
      ? isInProgress
        ? resolveInProgressPrimaryCta(lifecycleSlot)
        : resolveUpcomingPrimaryCta(lifecycleSlot, minutesUntil)
      : { kind: "none" as const };

  const jobDetailHref = `/cleaner/job/${encodeURIComponent(job.id)}`;

  const earningsBlock = (
    <div className="space-y-0.5">
      {hasResolvedEarnings ? (
        <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
          {formatZarFromCents(earningsCents)}
          {job.earningsIsEstimate ? (
            <span className="ml-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">(est.)</span>
          ) : null}
        </div>
      ) : showUxExact && uxPay?.kind === "exact" ? (
        <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">{formatZarWhole(uxPay.zar)}</div>
      ) : (
        <div className="text-2xl font-bold tabular-nums text-green-600 dark:text-green-400">
          {formatCleanerUxEstimatedPayRangeLabel()}
        </div>
      )}
      {hasPayForRate || showUxExact ? (
        <div className="text-xs text-zinc-500 dark:text-zinc-400">You earn</div>
      ) : null}
    </div>
  );

  if (isPast) {
    return (
      <Card
        className={cn(
          "rounded-2xl border border-zinc-200/90 bg-zinc-50/80 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80",
          highlightPulse && "ring-2 ring-emerald-500/90 ring-offset-2 ring-offset-zinc-50 dark:ring-emerald-400/90 dark:ring-offset-zinc-950",
        )}
      >
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{scheduleLineRich(job)}</p>
          {hasPayForRate || showUxRange || showUxExact ? <div>{earningsBlock}</div> : null}
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{suburb}</p>
          {job.scopeLines.length > 0 ? (
            <ul className="list-inside list-disc space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
              {job.scopeLines.map((line, i) => (
                <li key={`${i}-${line}`}>{line}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-col gap-2 pt-0.5">
            <Button variant="outline" className="h-11 w-full rounded-xl font-medium" asChild>
              <Link href={jobDetailHref} className="flex items-center justify-center gap-1">
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                View details
                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </Link>
            </Button>
            {onIssueReportSuccess ? (
              <CleanerReportJobIssueDialog
                bookingId={job.id}
                locationHint={suburb}
                linkTrigger
                onSuccess={onIssueReportSuccess}
              />
            ) : null}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className={cn(
        "rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900",
        highlightPulse && "ring-2 ring-emerald-500/90 ring-offset-2 ring-offset-zinc-50 dark:ring-emerald-400/90 dark:ring-offset-zinc-950",
        showNextJobCallout && "border-emerald-400/70 shadow-md dark:border-emerald-600/50",
      )}
    >
      <CardContent className={cn("space-y-3", showNextJobCallout ? "p-5" : "p-4")}>
        {showNextJobCallout ? (
          <span className="inline-flex rounded-full border border-emerald-400/80 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100">
            Next job
          </span>
        ) : null}

        {useScheduleUx || isInProgress ? (
          <>
            <div className="flex items-start justify-between gap-3">
              <p
                className={cn(
                  "min-w-0 flex-1 font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50",
                  showNextJobCallout ? "text-xl" : "text-lg",
                )}
              >
                {primaryTimeLine}
              </p>
              <span
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  scheduleChipClassName(statusChipKind),
                )}
              >
                {statusChipLabel}
              </span>
            </div>

            {earningsBlock}

            <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              {jobDurationLine ? <p>{jobDurationLine}</p> : null}
              <p className="font-medium text-zinc-800 dark:text-zinc-200">{suburb}</p>
              {job.scopeLines.length > 0 ? (
                <ul className="list-inside list-disc space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                  {job.scopeLines.map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              ) : null}
            </div>

            {microNudge ? <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{microNudge}</p> : null}
          </>
        ) : (
          <>
            {earningsBlock}
            {jobDurationLine ? <p className="text-xs text-zinc-500 dark:text-zinc-400">{jobDurationLine}</p> : null}
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{suburb}</p>
            {job.scopeLines.length > 0 ? (
              <ul className="list-inside list-disc space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                {job.scopeLines.map((line, i) => (
                  <li key={`${i}-${line}`}>{line}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{primaryTimeLine}</p>
          </>
        )}

        {job.isTeamJob ? (
          <p className="text-xs text-zinc-600 dark:text-zinc-300">{teamJobAssignmentHeadline(job.teamMemberCount)}</p>
        ) : null}

        {job.isTeamJob && teamChip ? (
          <div className="space-y-1">
            <StatusBadge tone={chipToTone(teamChip.variant)}>{teamChip.label}</StatusBadge>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2 pt-0.5">
          {acceptPrimary ? (
            <div className="flex flex-wrap gap-2">
              <Button
                className="h-12 min-h-12 flex-1 rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                disabled={busy}
                onClick={() => void onJobAction(job.id, acceptPrimary.action, acceptPrimary.opts)}
              >
                {busy ? "Saving…" : acceptPrimary.label}
              </Button>
              {lifecycleSlot?.kind === "accept_reject" && lifecycleSlot.canReject ? (
                <Button
                  variant="outline"
                  className="h-12 min-h-12 rounded-xl border-red-300 font-semibold text-red-800 dark:border-red-800 dark:text-red-200"
                  disabled={busy}
                  onClick={() => void onJobAction(job.id, "reject")}
                >
                  Reject
                </Button>
              ) : null}
            </div>
          ) : null}

          {!acceptPrimary && postAcceptCta.kind === "view_details" ? (
            <Button
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              asChild
            >
              <Link href={jobDetailHref} className="flex items-center justify-center gap-1">
                View details
                <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
              </Link>
            </Button>
          ) : null}

          {!acceptPrimary && postAcceptCta.kind === "lifecycle" ? (
            <Button
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={busy}
              onClick={() =>
                void onJobAction(job.id, postAcceptCta.action as CleanerJobAction, postAcceptCta.opts)
              }
            >
              <span className="flex w-full items-center justify-center gap-1">
                {busy ? "Saving…" : postAcceptCta.label}
                {!busy ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
              </span>
            </Button>
          ) : null}

          <Button
            variant="outline"
            className="h-12 w-full rounded-xl border-zinc-200 bg-white font-medium dark:border-zinc-600 dark:bg-zinc-900"
            asChild
          >
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <MapPin className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              Directions
            </a>
          </Button>

          {!(postAcceptCta.kind === "view_details") ? (
            <Button
              variant="outline"
              className="h-12 w-full rounded-xl border-zinc-200 bg-white font-medium dark:border-zinc-600 dark:bg-zinc-900"
              asChild
            >
              <Link href={jobDetailHref} className="flex w-full items-center justify-center gap-1">
                <FileText className="h-4 w-4 shrink-0" aria-hidden />
                View details
                <ChevronRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
              </Link>
            </Button>
          ) : null}

          {onIssueReportSuccess ? (
            <div className="pt-0.5 text-center">
              <CleanerReportJobIssueDialog
                bookingId={job.id}
                locationHint={suburb}
                linkTrigger
                onSuccess={onIssueReportSuccess}
              />
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
