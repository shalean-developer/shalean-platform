"use client";

import Link from "next/link";
import { ChevronRight, Clock, MapPin, Phone, Sparkles, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerJobAction } from "@/hooks/useCleanerMobileWorkspace";
import type { CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";
import { scheduleLineRich, telHref } from "@/lib/cleaner/cleanerJobCardFormat";
import { formatCleanerAvailabilityConfirmedMessage } from "@/lib/cleaner/cleanerAvailabilityConfirmedCopy";
import { teamSelfAvailabilityChip } from "@/lib/cleaner/teamAvailabilityUi";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";
import { cn } from "@/lib/utils";
import { StatusBadge, type StatusBadgeTone } from "@/components/cleaner/mobile/dashboard/StatusBadge";
import { TeamAvatars } from "@/components/cleaner/mobile/dashboard/TeamAvatars";

function chipToTone(variant: "confirmed" | "on_job" | "pending"): StatusBadgeTone {
  if (variant === "confirmed") return "emerald";
  if (variant === "on_job") return "sky";
  return "amber";
}

type Props = {
  job: CleanerMobileJobView;
  variant: "active" | "next";
  actingId: string | null;
  availabilityAcked: boolean;
  highlightPulse?: boolean;
  cleanerRating?: number | null;
  onJobAction: (
    bookingId: string,
    action: CleanerJobAction,
    opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string },
  ) => Promise<void>;
};

export function CleanerJobCard({
  job,
  variant,
  actingId,
  availabilityAcked,
  highlightPulse,
  cleanerRating,
  onJobAction,
}: Props) {
  const isActive = variant === "active";
  const busy = actingId === job.id;
  const tel = telHref(job.phone);
  const phoneDisplay = job.phone?.trim() || "";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`;

  const eyebrow =
    isActive && job.phase === "in_progress"
      ? "In progress"
      : isActive && job.phase === "en_route"
        ? "On the way"
        : isActive
          ? "Assigned"
          : job.phase === "en_route"
            ? "Up next"
            : "Up next";

  const serviceLabel = job.service?.trim() || "Cleaning";
  const chip = job.isTeamJob ? teamSelfAvailabilityChip(job.phase, availabilityAcked) : null;

  const teamCount =
    job.isTeamJob && typeof job.teamMemberCount === "number" && job.teamMemberCount > 0
      ? Math.floor(job.teamMemberCount)
      : job.isTeamJob
        ? 3
        : 1;
  const soloInitial = job.customerName.trim().slice(0, 1) || "?";

  const perHourZar =
    job.earningsZar != null && job.durationHours > 0 && Number.isFinite(job.durationHours) && job.durationHours > 0
      ? Math.round(job.earningsZar / job.durationHours)
      : null;
  const perHourLine = perHourZar != null ? `R${perHourZar.toLocaleString("en-ZA")} / hr` : null;

  const showRating =
    typeof cleanerRating === "number" && Number.isFinite(cleanerRating) && cleanerRating > 0 && cleanerRating <= 5;

  return (
    <Card
      className={cn(
        "rounded-2xl border border-gray-100 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900",
        highlightPulse && "ring-2 ring-emerald-500/90 ring-offset-2 ring-offset-zinc-50 dark:ring-emerald-400/90 dark:ring-offset-zinc-950",
      )}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-zinc-400">
              {eyebrow.replace(/\s+/g, " ").toUpperCase()}
            </span>
            <span className="rounded-full bg-blue-50 px-3 py-0.5 text-xs font-semibold text-blue-900 dark:bg-blue-950/55 dark:text-blue-100">
              {serviceLabel}
            </span>
          </div>
          <Link
            href={`/cleaner/job/${job.id}`}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 dark:bg-blue-500"
            aria-label="Job details"
          >
            <Sparkles className="h-5 w-5" strokeWidth={2} aria-hidden />
          </Link>
        </div>

        <h3 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-50">{job.customerName}</h3>

        <ul className="space-y-3 text-sm leading-snug text-zinc-700 dark:text-zinc-200">
          <li className="flex gap-3">
            <Clock className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-zinc-500" aria-hidden />
            <span className="font-medium text-zinc-900 dark:text-zinc-50">{scheduleLineRich(job)}</span>
          </li>
          <li className="flex gap-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-zinc-500" aria-hidden />
            <span>{job.address}</span>
          </li>
          {phoneDisplay ? (
            <li className="flex gap-3">
              <Phone className="mt-0.5 h-4 w-4 shrink-0 text-gray-400 dark:text-zinc-500" aria-hidden />
              {tel ? (
                <a href={tel} className="font-semibold text-blue-600 hover:underline dark:text-blue-400">
                  {phoneDisplay}
                </a>
              ) : (
                <span className="font-semibold">{phoneDisplay}</span>
              )}
            </li>
          ) : null}
        </ul>

        {job.operationalNoteChips.length > 0 || job.notes ? (
          <div className="rounded-xl border border-zinc-100 bg-zinc-50/90 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800/60 dark:text-zinc-300">
            <span className="font-semibold uppercase tracking-wide text-zinc-500">Notes</span>
            {job.operationalNoteChips.length > 0 ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {job.operationalNoteChips.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:bg-amber-950/50 dark:text-amber-100"
                  >
                    {c}
                  </span>
                ))}
              </div>
            ) : null}
            {job.notes ? <p className="mt-1.5 whitespace-pre-wrap text-zinc-700 dark:text-zinc-200">{job.notes}</p> : null}
          </div>
        ) : null}

        <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-zinc-700 dark:text-zinc-200">
                <TeamAvatars count={teamCount} soloInitial={soloInitial} />
                <span className="font-medium">
                  {job.isTeamJob ? `${teamCount} cleaner${teamCount === 1 ? "" : "s"}` : "Solo visit"}
                </span>
                {showRating ? (
                  <span className="inline-flex items-center gap-1 font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-hidden />
                    {cleanerRating.toFixed(1)}
                  </span>
                ) : null}
              </div>
              {job.isTeamJob ? (
                <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                  {teamJobAssignmentHeadline(job.teamMemberCount)}
                </p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              {job.earningsZar != null ? (
                <>
                  <p
                    className={cn(
                      "text-xs font-semibold uppercase tracking-wide",
                      job.earningsIsEstimate ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    {job.earningsIsEstimate ? "Est. you earn" : "You earn"}
                  </p>
                  <p
                    className={cn(
                      "mt-0.5 text-xl font-bold tabular-nums",
                      job.earningsIsEstimate ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                    )}
                  >
                    R{job.earningsZar.toLocaleString("en-ZA")}
                  </p>
                  {perHourLine ? <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{perHourLine}</p> : null}
                </>
              ) : (
                <>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">You earn</p>
                  <p className="mt-0.5 text-base font-bold text-amber-600">Pending</p>
                </>
              )}
              {job.isTeamJob && typeof job.teamMemberCount === "number" && job.teamMemberCount > 1 ? (
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                  Per cleaner · team of {job.teamMemberCount}
                </p>
              ) : null}
            </div>
          </div>

          {job.isTeamJob && chip ? (
            <div className="space-y-1.5">
              <StatusBadge tone={chipToTone(chip.variant)}>{chip.label}</StatusBadge>
              <p className="text-xs text-zinc-600 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 pt-1">
          {job.phase === "in_progress" ? (
            <Button
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={busy}
              onClick={() => void onJobAction(job.id, "complete")}
            >
              <span className="flex w-full items-center justify-center gap-1">
                {busy ? "Saving…" : "Complete job"}
                {!busy ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
              </span>
            </Button>
          ) : job.isTeamJob && job.phase === "assigned" && !availabilityAcked ? (
            <Button
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={busy}
              onClick={() =>
                void onJobAction(job.id, "accept", {
                  teamAvailabilityConfirm: true,
                  scheduleSummary: formatCleanerAvailabilityConfirmedMessage(job.date, job.time),
                })
              }
            >
              <span className="flex w-full items-center justify-center gap-1">
                {busy ? "Saving…" : "Confirm availability"}
                {!busy ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
              </span>
            </Button>
          ) : job.phase === "assigned" ? (
            <Button
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={busy}
              onClick={() => void onJobAction(job.id, "en_route")}
            >
              <span className="flex w-full items-center justify-center gap-1">
                {busy ? "Saving…" : "On the way"}
                {!busy ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
              </span>
            </Button>
          ) : job.phase === "en_route" ? (
            <Button
              className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
              disabled={busy}
              onClick={() => void onJobAction(job.id, "start")}
            >
              <span className="flex w-full items-center justify-center gap-1">
                {busy ? "Saving…" : "Start job"}
                {!busy ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
              </span>
            </Button>
          ) : null}

          <Button variant="outline" className="h-12 w-full rounded-xl border-gray-200 bg-white font-medium dark:border-zinc-600 dark:bg-zinc-900" asChild>
            <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
              <MapPin className="mr-2 h-4 w-4 shrink-0" aria-hidden />
              Get directions
            </a>
          </Button>

          <Button variant="ghost" className="h-9 text-sm font-medium text-blue-600 dark:text-blue-400" asChild>
            <Link href={`/cleaner/job/${job.id}`} className="mx-auto w-full text-center">
              View full details
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
