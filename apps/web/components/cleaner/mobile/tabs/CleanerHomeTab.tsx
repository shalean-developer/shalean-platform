"use client";

import Link from "next/link";
import { MapPin, Navigation, Phone, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerJobAction } from "@/hooks/useCleanerMobileWorkspace";
import type { CleanerMobileJobView } from "@/lib/cleaner/cleanerMobileBookingMap";
import { formatCleanerAvailabilityConfirmedMessage } from "@/lib/cleaner/cleanerAvailabilityConfirmedCopy";
import { teamSelfAvailabilityChip } from "@/lib/cleaner/teamAvailabilityUi";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";

function formatDuration(hours: number) {
  if (hours % 1 === 0) return `${hours}h`;
  return `${hours}h`;
}

function telHref(phone: string) {
  const d = phone.replace(/\s/g, "");
  return d ? `tel:${d}` : undefined;
}

function JobHeroCard({
  job,
  variant,
  actingId,
  availabilityAcked,
  onJobAction,
}: {
  job: CleanerMobileJobView;
  variant: "active" | "next";
  actingId: string | null;
  availabilityAcked: boolean;
  onJobAction: (
    bookingId: string,
    action: CleanerJobAction,
    opts?: { teamAvailabilityConfirm?: boolean; scheduleSummary?: string },
  ) => Promise<void>;
}) {
  const isActive = variant === "active";
  const busy = actingId === job.id;
  const tel = telHref(job.phone);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`;

  const badgeLabel = isActive
    ? job.phase === "in_progress"
      ? "In progress"
      : job.phase === "en_route"
        ? "On the way"
        : "Assigned"
    : job.phase === "en_route"
      ? "On the way · up next"
      : "Up next";

  return (
    <Card className="rounded-2xl border-blue-100 shadow-sm dark:border-blue-900/40">
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Badge variant="default" className="mb-2">
              {badgeLabel}
            </Badge>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{job.customerName}</h2>
            <p className="mt-1 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
              <span>{job.address}</span>
            </p>
          </div>
          <Sparkles className="h-8 w-8 shrink-0 text-blue-500/90" aria-hidden />
        </div>

        {job.isTeamJob ? (
          <div className="rounded-xl border border-blue-200 bg-blue-50/90 px-3 py-2.5 text-sm dark:border-blue-900/50 dark:bg-blue-950/35">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-zinc-900 dark:text-zinc-50">{teamJobAssignmentHeadline(job.teamMemberCount)}</p>
              {(() => {
                const chip = teamSelfAvailabilityChip(job.phase, availabilityAcked);
                const cls =
                  chip.variant === "confirmed"
                    ? "border-emerald-300/80 bg-emerald-100/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                    : chip.variant === "on_job"
                      ? "border-sky-300/80 bg-sky-100/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                      : "border-amber-300/80 bg-amber-100/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100";
                return (
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${cls}`}>
                    {chip.label}
                  </span>
                );
              })()}
            </div>
            <p className="mt-1 text-xs leading-snug text-zinc-600 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Time</p>
            <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">
              {job.time} · {formatDuration(job.durationHours)}
            </p>
          </div>
          <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
            <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Service</p>
            <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{job.service}</p>
          </div>
        </div>

        {job.notes ? (
          <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-200">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Notes</p>
            <p className="mt-1">{job.notes}</p>
          </div>
        ) : null}

        <div className="flex flex-col gap-2">
          {job.phase === "in_progress" ? (
            <Button
              size="lg"
              className="h-12 w-full rounded-xl text-base"
              disabled={busy}
              onClick={() => void onJobAction(job.id, "complete")}
            >
              {busy ? "Saving…" : "Complete job"}
            </Button>
          ) : (
            <>
              {job.isTeamJob && job.phase === "assigned" ? (
                <Button
                  size="lg"
                  className="h-12 w-full rounded-xl text-base"
                  disabled={busy || availabilityAcked}
                  onClick={() =>
                    void onJobAction(job.id, "accept", {
                      teamAvailabilityConfirm: true,
                      scheduleSummary: formatCleanerAvailabilityConfirmedMessage(job.date, job.time),
                    })
                  }
                >
                  {busy ? "Saving…" : availabilityAcked ? "Availability saved" : "Confirm availability"}
                </Button>
              ) : null}
              {job.phase === "assigned" ? (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    size="lg"
                    className="h-12 rounded-xl text-base"
                    disabled={busy}
                    onClick={() => void onJobAction(job.id, "en_route")}
                  >
                    On the way
                  </Button>
                  <Button
                    size="lg"
                    className="h-12 rounded-xl text-base"
                    disabled={busy}
                    onClick={() => void onJobAction(job.id, "start")}
                  >
                    Start job
                  </Button>
                </div>
              ) : (
                <Button
                  size="lg"
                  className="h-12 w-full rounded-xl text-base"
                  disabled={busy}
                  onClick={() => void onJobAction(job.id, "start")}
                >
                  {busy ? "Saving…" : "Start job"}
                </Button>
              )}
            </>
          )}

          <div className="grid grid-cols-2 gap-2">
            {tel ? (
              <Button variant="outline" size="lg" className="h-12 rounded-xl text-base" asChild>
                <a href={tel}>
                  <Phone className="h-4 w-4" aria-hidden />
                  Call
                </a>
              </Button>
            ) : (
              <Button variant="outline" size="lg" className="h-12 rounded-xl text-base" disabled>
                <Phone className="h-4 w-4" aria-hidden />
                Call
              </Button>
            )}
            <Button variant="outline" size="lg" className="h-12 rounded-xl text-base" asChild>
              <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                <Navigation className="h-4 w-4" aria-hidden />
                Directions
              </a>
            </Button>
          </div>

          <Button variant="ghost" size="lg" className="h-11 text-base text-blue-600 dark:text-blue-400" asChild>
            <Link href={`/cleaner/job/${job.id}`}>View full details</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function CleanerHomeTab({
  loading,
  error,
  activeJob,
  nextJob,
  hasAnyJob,
  actingId,
  teamAvailabilityAckIds,
  onJobAction,
}: {
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
  ) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-48 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
        <div className="h-12 animate-pulse rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60" />
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

  if (activeJob) {
    return (
      <JobHeroCard
        job={activeJob}
        variant="active"
        actingId={actingId}
        availabilityAcked={teamAvailabilityAckIds.has(activeJob.id)}
        onJobAction={onJobAction}
      />
    );
  }
  if (nextJob) {
    return (
      <JobHeroCard
        job={nextJob}
        variant="next"
        actingId={actingId}
        availabilityAcked={teamAvailabilityAckIds.has(nextJob.id)}
        onJobAction={onJobAction}
      />
    );
  }
  if (!hasAnyJob) {
    return (
      <Card className="rounded-2xl shadow-sm">
        <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/50">
            <Sparkles className="h-7 w-7 text-blue-600 dark:text-blue-400" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">No assigned jobs</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">When dispatch assigns you a visit, it appears here immediately.</p>
          </div>
          <Badge variant="outline">Live roster</Badge>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
        No upcoming jobs in your schedule.
      </CardContent>
    </Card>
  );
}
