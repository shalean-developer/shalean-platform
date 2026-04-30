"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Navigation, Route, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  bookingRowToMobileView,
  deriveCleanerJobLifecycleSlot,
  deriveMobilePhase,
  formatApproxJobDurationJobLabel,
  groupCleanerScheduleRows,
  type CleanerScheduleSectionKey,
} from "@/lib/cleaner/cleanerMobileBookingMap";
import {
  earliestOpenBookingId,
  formatUpcomingSchedulePrimaryTimeLine,
  minutesUntilJobStartJohannesburg,
  resolveInProgressPrimaryCta,
  resolveUpcomingPrimaryCta,
  upcomingScheduleStatusChip,
  upcomingScheduleStatusChipLabel,
  upcomingTravelMicroNudge,
} from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";
import { formatZarFromCents, formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import {
  cleanerUxEstimatedPayZar,
  formatCleanerUxEstimatedPayRangeLabel,
} from "@/lib/cleaner/cleanerUxEstimatedPayZar";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";
import { teamSelfAvailabilityChip } from "@/lib/cleaner/teamAvailabilityUi";
import { CleanerReportJobIssueDialog } from "@/components/cleaner/CleanerReportJobIssueDialog";
import type { CleanerScheduleLifecycleAction } from "@/hooks/useCleanerMobileWorkspace";
import { cn } from "@/lib/utils";

type RouteStop = {
  id: string;
  time: string;
  service: string | null;
  locationLabel: string | null;
  sequence: number;
  travelMinutesFromPrev: number;
};

type RouteSchedule = {
  jobs: RouteStop[];
  metrics?: { travelTimeSavedMinutes?: number; totalTravelMinutes?: number };
};

function pastVisitBadge(row: CleanerBookingRow) {
  const st = String(row.status ?? "").toLowerCase();
  if (st === "completed") return <Badge variant="outline">Completed</Badge>;
  if (st === "cancelled") return <Badge variant="outline">Cancelled</Badge>;
  return <Badge variant="outline">Past</Badge>;
}

function openScheduleChipClassName(chip: ReturnType<typeof upcomingScheduleStatusChip>): string {
  if (chip === "late") return "border-rose-300/90 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100";
  if (chip === "starting_soon" || chip === "in_progress") {
    return "border-amber-300/90 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100";
  }
  return "border-zinc-300/90 bg-zinc-100/90 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-100";
}

function formatDuration(hours: number) {
  if (hours % 1 === 0) return `${hours}h`;
  return `${hours}h`;
}

function OptimizedRouteToday({ dateYmd, jobSignature }: { dateYmd: string; jobSignature: string }) {
  const [route, setRoute] = useState<RouteSchedule | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers || cancelled) return;
      setRouteLoading(true);
      void cleanerAuthenticatedFetch(`/api/cleaner/route?date=${encodeURIComponent(dateYmd)}`, { headers })
        .then((r) => r.json() as Promise<{ route?: RouteSchedule; error?: string }>)
        .then((j) => {
          if (!cancelled) setRoute(j.route ?? null);
        })
        .catch(() => {
          if (!cancelled) setRoute(null);
        })
        .finally(() => {
          if (!cancelled) setRouteLoading(false);
        });
    })();
    return () => {
      cancelled = true;
    };
  }, [dateYmd, jobSignature]);

  if (routeLoading) {
    return (
      <div className="mb-6 h-32 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" aria-hidden />
    );
  }

  const jobs = route?.jobs ?? [];
  if (jobs.length < 2) return null;

  const saved = route?.metrics?.travelTimeSavedMinutes ?? 0;

  return (
    <section className="mb-6">
      <div className="mb-3 flex items-center gap-2">
        <Route className="h-4 w-4 text-blue-600 dark:text-blue-400" aria-hidden />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Optimized route (today)</h2>
      </div>
      <Card className="rounded-2xl border-blue-100 shadow-sm dark:border-blue-900/40">
        <CardContent className="space-y-3 p-4">
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Suggested stop order from your assigned jobs — uses distance and time windows.
            {saved > 0 ? ` About ${saved} min less driving vs naive ordering.` : null}
          </p>
          <ol className="space-y-2">
            {jobs.map((stop) => (
              <li
                key={stop.id}
                className="flex items-start justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-sm dark:bg-zinc-800/60"
              >
                <div>
                  <span className="font-semibold text-blue-700 dark:text-blue-300">#{stop.sequence}</span>{" "}
                  <span className="font-medium text-zinc-900 dark:text-zinc-50">{stop.time}</span>
                  <p className="text-xs text-zinc-600 dark:text-zinc-300">{stop.service ?? "Cleaning"}</p>
                  <p className="text-xs text-zinc-500">{stop.locationLabel ?? "—"}</p>
                </div>
                <div className="shrink-0 text-right text-[11px] text-zinc-500">
                  {stop.travelMinutesFromPrev > 0 ? <span>+{stop.travelMinutesFromPrev} min drive</span> : <span>Start</span>}
                </div>
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-zinc-500">Open each job for turn-by-turn maps.</p>
        </CardContent>
      </Card>
    </section>
  );
}

export function CleanerScheduleSection({
  rows,
  nowMs,
  loading,
  showLifecycleActions = false,
  actingId = null,
  teamAvailabilityAckIds = new Set<string>(),
  onLifecycleAction,
  onIssueReportSuccess,
  /**
   * Post–complete trust banner (`useTrustCompletionBanner` + `CleanerJobCompletionTrustBanner`).
   * **Required** when both `showLifecycleActions` and `onLifecycleAction` are set (inline complete must surface the same banner as job detail / home).
   */
  completionTrustBannerSlot,
  /** When set, only these sections render; empty result returns `null` (no empty-state card). */
  visibleSectionKeys,
  /** From `/api/cleaner/me` — UX-only pay hint when row has no display earnings yet. */
  cleanerCreatedAtIso,
}: {
  rows: CleanerBookingRow[];
  nowMs: number;
  loading?: boolean;
  showLifecycleActions?: boolean;
  actingId?: string | null;
  teamAvailabilityAckIds?: Set<string>;
  onLifecycleAction?: (
    bookingId: string,
    action: CleanerScheduleLifecycleAction,
    meta?: { teamAvailabilityConfirm?: boolean; date?: string | null; time?: string | null },
  ) => Promise<{ ok: boolean }>;
  onIssueReportSuccess?: () => void;
  completionTrustBannerSlot?: ReactNode;
  visibleSectionKeys?: CleanerScheduleSectionKey[];
  cleanerCreatedAtIso?: string | null;
}) {
  const now = new Date(nowMs);
  const { todayYmd, sections } = groupCleanerScheduleRows(rows, now);
  const jobSignature = rows.map((r) => r.id).join(",");

  const displaySections =
    visibleSectionKeys?.length ?
      visibleSectionKeys
        .map((k) => sections.find((s) => s.key === k))
        .filter((s): s is (typeof sections)[number] => s != null && s.rows.length > 0)
    : sections;

  const overdueN = sections.find((s) => s.key === "overdue")?.rows.length ?? 0;
  const todayN = sections.find((s) => s.key === "today")?.rows.length ?? 0;
  const upcomingN = sections.find((s) => s.key === "upcoming")?.rows.length ?? 0;
  const completedN = sections.find((s) => s.key === "completed")?.rows.length ?? 0;
  const openN = overdueN + todayN + upcomingN;
  const overdueRowsFull = sections.find((s) => s.key === "overdue")?.rows ?? [];
  const todayRowsFull = sections.find((s) => s.key === "today")?.rows ?? [];
  const upcomingRowsFull = sections.find((s) => s.key === "upcoming")?.rows ?? [];
  const nextGlobalOpenId = earliestOpenBookingId([...overdueRowsFull, ...todayRowsFull, ...upcomingRowsFull]);

  const dashboardFilter = Boolean(visibleSectionKeys?.length);
  const showOptimizedRoute = !dashboardFilter || (visibleSectionKeys?.includes("today") ?? false);

  if (dashboardFilter) {
    if (loading) return null;
    if (rows.length === 0) return null;
    if (displaySections.length === 0) return null;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3, 4].map((k) => (
          <div key={k} className="h-24 animate-pulse rounded-2xl bg-zinc-200/80 dark:bg-zinc-800/80" />
        ))}
      </div>
    );
  }

  if (rows.length === 0) {
    if (dashboardFilter) return null;
    return (
      <div className="space-y-4">
        <OptimizedRouteToday dateYmd={todayYmd} jobSignature={jobSignature} />
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-2 p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">No upcoming jobs</p>
            <p>Check offers to keep earning.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (sections.length === 0) {
    if (dashboardFilter) return null;
    return (
      <div className="space-y-4">
        <OptimizedRouteToday dateYmd={todayYmd} jobSignature={jobSignature} />
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-2 p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
            <p className="font-medium text-zinc-900 dark:text-zinc-50">No upcoming jobs</p>
            <p>Check offers to keep earning.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {completionTrustBannerSlot ? <div className="space-y-2">{completionTrustBannerSlot}</div> : null}
      {!dashboardFilter && openN === 0 && completedN > 0 ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
          You&apos;ve completed all your recent jobs.
        </p>
      ) : null}

      {showOptimizedRoute ? <OptimizedRouteToday dateYmd={todayYmd} jobSignature={jobSignature} /> : null}

      {!dashboardFilter && openN === 0 && rows.length > 0 ? (
        <Card className="rounded-2xl border border-zinc-200/90 shadow-sm dark:border-zinc-700">
          <CardContent className="space-y-1 p-5 text-center text-sm text-zinc-600 dark:text-zinc-400">
            <p className="font-semibold text-zinc-900 dark:text-zinc-50">No upcoming jobs</p>
            <p>Check offers to keep earning</p>
          </CardContent>
        </Card>
      ) : null}

      {displaySections.map(({ key, title, rows: sectionRows }) => (
        <section key={key}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
          {key === "completed" ? (
            <p className="mb-2 text-[11px] text-zinc-500 dark:text-zinc-400">
              Completed and cancelled visits (Johannesburg calendar dates).
            </p>
          ) : null}
          <ul className="space-y-3">
            {sectionRows.map((row) => {
              const v = bookingRowToMobileView(row);
              const earnCents = v.earningsCents;
              const uxHint =
                earnCents != null && earnCents > 0
                  ? null
                  : cleanerUxEstimatedPayZar(cleanerCreatedAtIso ?? null, v.jobTotalZar, now);
              const mapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(v.address)}`;
              const completedLook = key === "completed";
              const st = String(row.status ?? "").toLowerCase();
              const busy = actingId === row.id;
              const isTeam = row.is_team_job === true;
              const phase = deriveMobilePhase(row);
              const rec = row as Record<string, unknown>;
              const rawResp = rec.cleaner_response_status as string | null | undefined;
              const respLower = rawResp == null || rawResp === "" ? "" : String(rawResp).trim().toLowerCase();
              const serverAccepted =
                respLower === "accepted" ||
                respLower === "on_my_way" ||
                respLower === "started";
              const teamAcked = teamAvailabilityAckIds.has(row.id);
              const lifecycleSlot = deriveCleanerJobLifecycleSlot(row);
              const availChip = isTeam ? teamSelfAvailabilityChip(phase, serverAccepted, teamAcked) : null;
              const run = onLifecycleAction;
              const isInProgressCard = st === "in_progress";
              const isNextOpen = !completedLook && String(row.id) === nextGlobalOpenId;
              const minutesUntil = !completedLook ? minutesUntilJobStartJohannesburg(v.date, v.time, now) : null;
              const scheduleChipKind = !completedLook ? upcomingScheduleStatusChip(row, minutesUntil) : null;
              const microNudge =
                !completedLook && !isInProgressCard ? upcomingTravelMicroNudge(minutesUntil, row) : null;
              const postAcceptCta =
                !completedLook && lifecycleSlot && lifecycleSlot.kind !== "accept_reject"
                  ? isInProgressCard
                    ? resolveInProgressPrimaryCta(lifecycleSlot)
                    : resolveUpcomingPrimaryCta(lifecycleSlot, minutesUntil)
                  : { kind: "none" as const };
              const hasPayOpen =
                (earnCents != null && earnCents > 0) || uxHint?.kind === "exact" || uxHint?.kind === "range";
              const durationLineOpen =
                hasPayOpen && v.durationHours > 0 && Number.isFinite(v.durationHours)
                  ? formatApproxJobDurationJobLabel(v.durationHours)
                  : null;
              const suburb = suburbFromLocationForOffer(v.address);
              const jobHref = `/cleaner/job/${row.id}`;

              return (
                <li key={row.id}>
                  <Card
                    className={cn(
                      completedLook
                        ? "rounded-2xl border-zinc-200/80 bg-zinc-50/80 opacity-95 shadow-sm dark:border-zinc-700 dark:bg-zinc-900/50"
                        : "rounded-2xl shadow-sm",
                      !completedLook && isNextOpen && "border-emerald-400/75 shadow-md dark:border-emerald-600/45",
                    )}
                  >
                    <CardContent className={cn("flex flex-col gap-3", !completedLook && isNextOpen ? "p-5" : "p-4")}>
                      {completedLook ? (
                        <Link href={jobHref} className="block">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{v.time}</p>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              {pastVisitBadge(row)}
                              {row.cleaner_has_issue_report === true ? (
                                <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
                                  <TriangleAlert className="h-3 w-3" aria-hidden />
                                  Issue reported
                                </span>
                              ) : null}
                            </div>
                          </div>
                          <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{v.areaLabel}</p>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400">
                            {v.service} · {formatDuration(v.durationHours)}
                            {row.date ? ` · ${String(row.date).slice(0, 10)}` : null}
                          </p>
                          {v.scopeLines.length > 0 ? (
                            <ul className="mt-1 list-inside list-disc text-xs text-zinc-600 dark:text-zinc-400">
                              {v.scopeLines.map((line, i) => (
                                <li key={`${i}-${line}`}>{line}</li>
                              ))}
                            </ul>
                          ) : null}
                          <div className="mt-1.5 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                            {earnCents != null && earnCents > 0 ? (
                              <>
                                <span className="font-medium text-zinc-500 dark:text-zinc-400">You earn</span>
                                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatZarFromCents(earnCents)}
                                  {v.earningsIsEstimate ? (
                                    <span className="ml-1 font-normal text-zinc-500 dark:text-zinc-400">(est.)</span>
                                  ) : null}
                                </span>
                              </>
                            ) : uxHint?.kind === "exact" ? (
                              <>
                                <span className="font-medium text-zinc-500 dark:text-zinc-400">You earn</span>
                                <span className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatZarWhole(uxHint.zar)}
                                </span>
                              </>
                            ) : (
                              <span className="text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                                {formatCleanerUxEstimatedPayRangeLabel()}
                              </span>
                            )}
                          </div>
                        </Link>
                      ) : (
                        <>
                          {isNextOpen ? (
                            <span className="inline-flex w-fit rounded-full border border-emerald-400/80 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-950 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-100">
                              Next job
                            </span>
                          ) : null}
                          <Link href={jobHref} className="block space-y-2">
                            <div className="flex items-start justify-between gap-3">
                              <p
                                className={cn(
                                  "min-w-0 flex-1 font-bold leading-tight text-zinc-900 dark:text-zinc-50",
                                  isNextOpen ? "text-xl" : "text-lg",
                                )}
                              >
                                {formatUpcomingSchedulePrimaryTimeLine(v.date, v.time, now)}
                              </p>
                              {scheduleChipKind ? (
                                <span
                                  className={cn(
                                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                    openScheduleChipClassName(scheduleChipKind),
                                  )}
                                >
                                  {upcomingScheduleStatusChipLabel(scheduleChipKind)}
                                </span>
                              ) : null}
                            </div>
                            <div className="space-y-0.5">
                              {earnCents != null && earnCents > 0 ? (
                                <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatZarFromCents(earnCents)}
                                  {v.earningsIsEstimate ? (
                                    <span className="ml-1 text-sm font-medium text-zinc-500 dark:text-zinc-400">
                                      (est.)
                                    </span>
                                  ) : null}
                                </p>
                              ) : uxHint?.kind === "exact" ? (
                                <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatZarWhole(uxHint.zar)}
                                </p>
                              ) : (
                                <p className="text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                                  {formatCleanerUxEstimatedPayRangeLabel()}
                                </p>
                              )}
                              {(earnCents != null && earnCents > 0) || uxHint?.kind === "exact" ? (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">You earn</p>
                              ) : null}
                            </div>
                            <div className="space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                              {durationLineOpen ? <p>{durationLineOpen}</p> : null}
                              <p className="font-medium text-zinc-800 dark:text-zinc-200">{suburb}</p>
                              {v.scopeLines.length > 0 ? (
                                <ul className="list-inside list-disc space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                                  {v.scopeLines.map((line, i) => (
                                    <li key={`${i}-${line}`}>{line}</li>
                                  ))}
                                </ul>
                              ) : null}
                            </div>
                            {microNudge ? (
                              <p className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{microNudge}</p>
                            ) : null}
                          </Link>
                        </>
                      )}
                      {row.is_team_job === true ? (
                        <p className="text-xs font-medium leading-snug text-blue-800 dark:text-blue-200">
                          {teamJobAssignmentHeadline(
                            typeof row.teamMemberCount === "number" ? row.teamMemberCount : null,
                          )}
                        </p>
                      ) : null}
                      {/* TODO(trust-ux): REQUIRED — when using showLifecycleActions + onLifecycleAction, pass completionTrustBannerSlot from parent useTrustCompletionBanner. */}
                      {showLifecycleActions && !completedLook && run ? (
                        <>
                          {isTeam && availChip ? (
                            <div className="rounded-lg border border-blue-200 bg-blue-50/90 px-3 py-2 text-xs dark:border-blue-900/50 dark:bg-blue-950/35">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={[
                                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                                    availChip.variant === "confirmed"
                                      ? "border-emerald-300/80 bg-emerald-100/90 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100"
                                      : availChip.variant === "on_job"
                                        ? "border-sky-300/80 bg-sky-100/90 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100"
                                        : "border-amber-300/80 bg-amber-100/90 text-amber-950 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-100",
                                  ].join(" ")}
                                >
                                  {availChip.label}
                                </span>
                              </div>
                              <p className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
                            </div>
                          ) : null}
                          <div className="flex flex-col gap-2">
                            {lifecycleSlot?.kind === "accept_reject" ? (
                              <div className="flex w-full gap-2">
                                {lifecycleSlot.canReject ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void run(row.id, "reject")}
                                    className="h-12 min-h-12 flex-1 rounded-xl border border-red-300 text-sm font-semibold text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
                                  >
                                    Decline
                                  </button>
                                ) : null}
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(row.id, "accept", {
                                      teamAvailabilityConfirm: isTeam,
                                      date: row.date,
                                      time: row.time,
                                    })
                                  }
                                  className={cn(
                                    "h-12 min-h-12 rounded-xl bg-emerald-600 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500",
                                    lifecycleSlot.canReject ? "flex-1" : "w-full",
                                  )}
                                >
                                  {busy ? "Saving…" : isTeam ? "Confirm availability" : "Accept"}
                                </button>
                              </div>
                            ) : null}
                            {lifecycleSlot?.kind !== "accept_reject" && postAcceptCta.kind === "view_details" ? (
                              <Link
                                href={jobHref}
                                className="text-center text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                              >
                                View job details
                              </Link>
                            ) : null}
                            {lifecycleSlot?.kind !== "accept_reject" && postAcceptCta.kind === "lifecycle" ? (
                              postAcceptCta.action === "en_route" ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={async () => {
                                    const r = await run(row.id, "en_route", postAcceptCta.opts);
                                    if (r.ok) {
                                      window.open(mapsDirUrl, "_blank", "noopener,noreferrer");
                                    }
                                  }}
                                  className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 dark:bg-blue-600 dark:hover:bg-blue-500"
                                >
                                  <Navigation className="h-4 w-4 shrink-0" aria-hidden />
                                  {busy ? "Saving…" : "Navigate & On My Way"}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() =>
                                    void run(row.id, postAcceptCta.action as CleanerScheduleLifecycleAction, postAcceptCta.opts)
                                  }
                                  className={cn(
                                    "h-12 w-full rounded-xl text-sm font-semibold text-white shadow-sm disabled:opacity-60",
                                    postAcceptCta.action === "complete"
                                      ? "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                                      : "bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500",
                                  )}
                                >
                                  {busy ? "Saving…" : postAcceptCta.label}
                                </button>
                              )
                            ) : null}
                          </div>
                        </>
                      ) : null}
                      {!completedLook ? (
                        <div className="flex flex-col gap-2">
                          <Link
                            href={jobHref}
                            className="text-sm font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                          >
                            View job details
                          </Link>
                          <CleanerReportJobIssueDialog
                            bookingId={row.id}
                            locationHint={v.address}
                            variant="ghost"
                            onSuccess={onIssueReportSuccess}
                          />
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
