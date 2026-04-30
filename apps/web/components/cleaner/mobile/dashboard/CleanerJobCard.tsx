"use client";

import Link from "next/link";
import { ChevronRight, FileText, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CleanerReportJobIssueDialog } from "@/components/cleaner/CleanerReportJobIssueDialog";
import type { CleanerJobAction, PostJobActionResult } from "@/hooks/useCleanerMobileWorkspace";
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
  upcomingScheduleStatusChip,
  upcomingScheduleStatusChipLabel,
  upcomingTravelMicroNudge,
} from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeTone } from "@/components/cleaner/mobile/dashboard/StatusBadge";

const JOB_CARD_NOTE_CHARS = 72;
const JOB_CARD_EXTRAS_MAX = 3;

function CleanerJobCardDetails({ job }: { job: CleanerMobileJobView }) {
  const durLine = formatApproxJobDurationJobLabel(job.durationHours);
  const extras = job.extrasBulletNames.slice(0, JOB_CARD_EXTRAS_MAX);
  const moreExtras = job.extrasBulletNames.length - extras.length;
  const noteRaw = job.notes?.replace(/\s+/g, " ").trim() ?? "";
  const noteDisp =
    noteRaw.length > JOB_CARD_NOTE_CHARS ? `${noteRaw.slice(0, JOB_CARD_NOTE_CHARS - 1)}…` : noteRaw;
  const hasRooms = job.bedrooms != null || job.bathrooms != null;

  return (
    <div className="line-clamp-5 overflow-hidden rounded-md border border-zinc-100/90 bg-zinc-50/60 px-2 py-1.5 text-[11px] leading-snug text-zinc-700 dark:border-zinc-800 dark:bg-zinc-950/35 dark:text-zinc-300">
      <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Job details
      </p>
      <p className="truncate">
        <span aria-hidden>🧹 </span>Service:{" "}
        <span className="font-medium text-zinc-900 dark:text-zinc-100">{job.service}</span>
      </p>
      {hasRooms ? (
        <div className="mt-0.5">
          <p>Rooms:</p>
          {job.bedrooms != null ? (
            <p className="pl-1">
              • {job.bedrooms} Bedroom{job.bedrooms === 1 ? "" : "s"}
            </p>
          ) : null}
          {job.bathrooms != null ? (
            <p className="pl-1">
              • {job.bathrooms} Bathroom{job.bathrooms === 1 ? "" : "s"}
            </p>
          ) : null}
        </div>
      ) : null}
      {extras.length > 0 ? (
        <div className="mt-0.5">
          <p>
            <span aria-hidden>🧺 </span>Extras:
          </p>
          {extras.map((name) => (
            <p key={name} className="truncate pl-1">
              • {name}
            </p>
          ))}
          {moreExtras > 0 ? <p className="pl-1 text-zinc-500 dark:text-zinc-400">• +{moreExtras} more</p> : null}
        </div>
      ) : null}
      {durLine ? <p className="mt-0.5 text-zinc-600 dark:text-zinc-400">Duration: {durLine}</p> : null}
      {noteDisp ? (
        <p className="mt-0.5 line-clamp-2 break-words text-zinc-600 dark:text-zinc-400">
          <span aria-hidden>📝 </span>Notes: &ldquo;{noteDisp}&rdquo;
        </p>
      ) : null}
    </div>
  );
}

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
  /** Wall clock for JHB buckets (from workspace `now.getTime()`). */
  nowMs: number;
  onJobAction: (
    bookingId: string,
    action: CleanerJobAction,
    opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string },
  ) => Promise<PostJobActionResult>;
  onIssueReportSuccess?: () => void;
};

export function CleanerJobCard({
  job,
  variant,
  actingId,
  availabilityAcked,
  highlightPulse,
  showNextJobCallout = false,
  cleanerCreatedAtIso = null,
  nowMs,
  onJobAction,
  onIssueReportSuccess,
}: Props) {
  const now = new Date(nowMs);
  const busy = actingId === job.id;
  const mapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(job.address)}`;
  const crsLower = String(job.cleanerResponseStatus ?? "")
    .trim()
    .toLowerCase();
  const serverAccepted =
    crsLower === CLEANER_RESPONSE.ACCEPTED ||
    crsLower === CLEANER_RESPONSE.ON_MY_WAY ||
    crsLower === CLEANER_RESPONSE.STARTED;
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
  const microNudge = useScheduleUx ? upcomingTravelMicroNudge(minutesUntil, rowForLifecycle) : null;

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
        : { action: "accept" as const, label: "Accept" }
      : null;

  const jobDetailHref = `/cleaner/job/${encodeURIComponent(job.id)}`;

  const handleNavigateAndOnMyWay = async () => {
    const r = await onJobAction(job.id, "en_route");
    if (r.ok) {
      window.open(mapsDirUrl, "_blank", "noopener,noreferrer");
    }
  };

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
        data-cleaner-job-variant={variant}
        className={cn(
          "rounded-2xl border border-zinc-200/90 bg-zinc-50/80 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/80",
          highlightPulse && "ring-2 ring-emerald-500/90 ring-offset-2 ring-offset-zinc-50 dark:ring-emerald-400/90 dark:ring-offset-zinc-950",
        )}
      >
        <CardContent className="space-y-3 p-4">
          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{scheduleLineRich(job)}</p>
          {hasPayForRate || showUxRange || showUxExact ? <div>{earningsBlock}</div> : null}
          <CleanerJobCardDetails job={job} />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{suburb}</p>
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
      data-cleaner-job-variant={variant}
      className={cn(
        "flex min-h-0 flex-col rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900",
        highlightPulse && "ring-2 ring-emerald-500/90 ring-offset-2 ring-offset-zinc-50 dark:ring-emerald-400/90 dark:ring-offset-zinc-950",
        showNextJobCallout && "border-emerald-400/70 shadow-md dark:border-emerald-600/50",
      )}
    >
      <CardContent className="flex min-h-0 flex-1 flex-col gap-0 p-0">
        <div className={cn("min-h-0 flex-1 space-y-3", showNextJobCallout ? "p-5 pb-3" : "p-4 pb-3")}>
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

              <CleanerJobCardDetails job={job} />

              <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <p className="font-medium text-zinc-800 dark:text-zinc-200">{suburb}</p>
              </div>

              {microNudge ? <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{microNudge}</p> : null}
            </>
          ) : (
            <>
              {earningsBlock}
              <CleanerJobCardDetails job={job} />
              <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{suburb}</p>
              <p className="text-sm text-zinc-600 dark:text-zinc-300">{primaryTimeLine}</p>
            </>
          )}

          {job.isTeamJob ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs text-zinc-600 dark:text-zinc-300">{teamJobAssignmentHeadline(job.teamMemberCount)}</p>
                {job.isLeadCleaner ? (
                  <span className="inline-flex rounded-full border border-violet-300/90 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-950 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-100">
                    Team lead
                  </span>
                ) : null}
              </div>
              {job.teamRosterSummary ? (
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  <span className="font-medium text-zinc-600 dark:text-zinc-300">With: </span>
                  {job.teamRosterSummary}
                </p>
              ) : null}
            </div>
          ) : null}

          {job.isTeamJob && teamChip ? (
            <div className="space-y-1">
              <StatusBadge tone={chipToTone(teamChip.variant)}>{teamChip.label}</StatusBadge>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
            </div>
          ) : null}
        </div>

        <div
          className={cn(
            "sticky bottom-0 z-20 mt-auto border-t border-zinc-200/90 bg-white/95 px-4 py-3 shadow-[0_-10px_40px_-18px_rgba(0,0,0,0.18)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 dark:shadow-[0_-10px_40px_-18px_rgba(0,0,0,0.45)] md:static md:border-0 md:bg-transparent md:px-4 md:py-0 md:shadow-none md:backdrop-blur-none",
            showNextJobCallout ? "md:px-5" : "",
          )}
        >
          <div className="flex flex-col gap-2">
            {acceptPrimary ? (
              <div className="flex w-full gap-2">
                {lifecycleSlot?.kind === "accept_reject" && lifecycleSlot.canReject ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-14 min-h-14 flex-1 rounded-xl border-red-300 text-base font-semibold text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
                    disabled={busy}
                    onClick={() => void onJobAction(job.id, "reject")}
                  >
                    Decline
                  </Button>
                ) : null}
                <Button
                  type="button"
                  className={cn(
                    "h-14 min-h-14 rounded-xl text-base font-semibold text-white shadow-sm",
                    "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500",
                    lifecycleSlot?.kind === "accept_reject" && lifecycleSlot.canReject ? "flex-1" : "w-full",
                  )}
                  disabled={busy}
                  onClick={() => void onJobAction(job.id, acceptPrimary.action, acceptPrimary.opts)}
                >
                  {busy ? "Saving…" : acceptPrimary.label}
                </Button>
              </div>
            ) : null}

            {!acceptPrimary && lifecycleSlot?.kind === "en_route" ? (
              <Button
                type="button"
                className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                disabled={busy}
                onClick={() => void handleNavigateAndOnMyWay()}
              >
                <Navigation className="h-5 w-5 shrink-0" aria-hidden />
                {busy ? "Saving…" : "Navigate & On My Way"}
              </Button>
            ) : null}

            {!acceptPrimary && lifecycleSlot?.kind === "start" ? (
              <Button
                type="button"
                className="h-14 w-full rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                disabled={busy}
                onClick={() => void onJobAction(job.id, "start")}
              >
                {busy ? "Saving…" : "Start Job"}
              </Button>
            ) : null}

            {!acceptPrimary && isInProgress && lifecycleSlot?.kind === "complete" ? (
              <Button
                type="button"
                className="h-14 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                disabled={busy}
                onClick={() => void onJobAction(job.id, "complete")}
              >
                {busy ? "Saving…" : "Complete Job"}
              </Button>
            ) : null}

            <Link
              href={jobDetailHref}
              className="block text-center text-xs font-medium text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              View job details
            </Link>

            {onIssueReportSuccess ? (
              <div className="text-center">
                <CleanerReportJobIssueDialog
                  bookingId={job.id}
                  locationHint={suburb}
                  linkTrigger
                  onSuccess={onIssueReportSuccess}
                />
              </div>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
