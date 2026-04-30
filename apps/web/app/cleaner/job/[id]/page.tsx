"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, MapPin, Navigation, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import {
  bookingRowToMobileView,
  cleanerFacingDisplayEarningsCents,
  deriveCleanerJobLifecycleSlot,
  deriveMobilePhase,
} from "@/lib/cleaner/cleanerMobileBookingMap";
import { isBookingPayoutPaid } from "@/lib/cleaner/cleanerPayoutPaid";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";
import { addTeamAvailabilityAck } from "@/lib/cleaner/teamAvailabilitySession";
import type { CleanerJobAction } from "@/hooks/useCleanerMobileWorkspace";
import { CleanerJobEarningsRow } from "@/components/cleaner/mobile/CleanerJobEarningsRow";
import { CleanerReportJobIssueDialog } from "@/components/cleaner/CleanerReportJobIssueDialog";
import { CleanerJobCompletionTrustBanner } from "@/components/cleaner/CleanerJobCompletionTrustBanner";
import { CleanerEarningsConfirmedBanner } from "@/components/cleaner/CleanerEarningsConfirmedBanner";
import { trustJobCompletionFeedbackFromRow } from "@/lib/cleaner/trustJobCompletionFeedback";
import { useTrustCompletionBanner } from "@/hooks/useTrustCompletionBanner";
import { useCleanerPayoutSummary } from "@/hooks/useCleanerPayoutSummary";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { jobTotalZarFromCleanerBookingLike } from "@/lib/cleaner/cleanerUxEstimatedPayZar";
import { cn } from "@/lib/utils";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { useCleanerLiveLocationSender } from "@/hooks/useCleanerLiveLocationSender";

export default function CleanerJobDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [row, setRow] = useState<CleanerBookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [earningsConfirmedCents, setEarningsConfirmedCents] = useState<number | null>(null);
  const { trustCompletion, showTrustCompletionBanner, clearTrustCompletionBanner } = useTrustCompletionBanner();
  const { refresh: refreshPayoutSummary } = useCleanerPayoutSummary();
  const jobIdForEarningsRef = useRef<string | null>(null);
  const prevEarningsCentsRef = useRef<number | null>(null);
  const rtDebounceRef = useRef<number | null>(null);
  const [cleanerCreatedAtIso, setCleanerCreatedAtIso] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (!headers) return;
      const res = await cleanerAuthenticatedFetch("/api/cleaner/me", { headers });
      const json = (await res.json().catch(() => ({}))) as { cleaner?: { created_at?: string | null } | null };
      const raw = json.cleaner?.created_at;
      setCleanerCreatedAtIso(typeof raw === "string" && raw.trim() ? raw.trim() : null);
    })();
  }, []);

  const load = useCallback(async (opts?: { silent?: boolean }): Promise<CleanerBookingRow | null> => {
    const silent = opts?.silent === true;
    const headers = await getCleanerAuthHeaders();
    if (!headers || !id) {
      setError("Not signed in.");
      setRow(null);
      setLoading(false);
      return null;
    }
    if (!silent) setLoading(true);
    const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(id)}`, { headers });
    if (!silent) setLoading(false);
    const json = (await res.json()) as { job?: CleanerBookingRow; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load job.");
      setRow(null);
      return null;
    }
    setError(null);
    const job = json.job ?? null;
    setRow(job);
    return job;
  }, [id]);

  useEffect(() => {
    const tid = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(tid);
  }, [load]);

  useEffect(() => {
    if (!id) return;
    const sb = getSupabaseBrowser();
    if (!sb) return;

    let cancelled = false;
    let ch: ReturnType<typeof sb.channel> | null = null;

    void sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || !session?.user) return;
      const schedule = () => {
        if (rtDebounceRef.current) window.clearTimeout(rtDebounceRef.current);
        rtDebounceRef.current = window.setTimeout(() => {
          rtDebounceRef.current = null;
          void load({ silent: true });
        }, 400);
      };
      ch = sb
        .channel(`cleaner-job-detail-rt-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: `id=eq.${id}` }, schedule)
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (rtDebounceRef.current) window.clearTimeout(rtDebounceRef.current);
      if (ch) void sb.removeChannel(ch);
    };
  }, [id, load]);

  useEffect(() => {
    if (!row?.id) return;
    const cur = cleanerFacingDisplayEarningsCents(row);
    const completed = String(row.status ?? "").toLowerCase() === "completed";

    if (jobIdForEarningsRef.current !== row.id) {
      jobIdForEarningsRef.current = row.id;
      prevEarningsCentsRef.current = cur;
      return;
    }

    const prev = prevEarningsCentsRef.current;
    prevEarningsCentsRef.current = cur;

    if (!completed) return;
    if ((prev == null || prev === 0) && cur != null && cur > 0) {
      clearTrustCompletionBanner();
      setEarningsConfirmedCents(cur);
      const t = window.setTimeout(() => setEarningsConfirmedCents(null), 4500);
      return () => window.clearTimeout(t);
    }
  }, [row, clearTrustCompletionBanner]);

  const postJobAction = useCallback(
    async (action: CleanerJobAction): Promise<{ ok: boolean }> => {
      const headers = await getCleanerAuthHeaders();
      if (!headers || !id) {
        setActionMsg("Not signed in.");
        return { ok: false };
      }
      setActionMsg(null);
      setActing(true);
      try {
        const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(id)}`, {
          method: "POST",
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });
        const json = (await res.json()) as { ok?: boolean; error?: string };
        if (!res.ok) {
          setActionMsg(json.error ?? "Could not update job.");
          return { ok: false };
        }
        if (action === "accept") {
          addTeamAvailabilityAck(id);
        }
        const job = await load({ silent: true });
        if (action === "complete" && job) {
          const base = trustJobCompletionFeedbackFromRow(job);
          const sum = await refreshPayoutSummary();
          showTrustCompletionBanner({ ...base, todayTotalCents: sum?.today_cents ?? null });
        }
        return { ok: true };
      } catch {
        setActionMsg("Network error.");
        return { ok: false };
      } finally {
        setActing(false);
      }
    },
    [id, load, refreshPayoutSummary, showTrustCompletionBanner],
  );

  const crsForTrack = String(row?.cleaner_response_status ?? "")
    .trim()
    .toLowerCase();
  const trackBookingId = id && row && crsForTrack === CLEANER_RESPONSE.ON_MY_WAY ? id : null;
  useCleanerLiveLocationSender({
    bookingId: trackBookingId,
    enabled: Boolean(trackBookingId),
    online: true,
  });

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-zinc-50 p-4 dark:bg-zinc-950">
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
        <div className="mt-4 h-64 animate-pulse rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
      </div>
    );
  }

  if (error || !row) {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
        <header className="border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
          <Link
            href="/cleaner"
            className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Link>
        </header>
        <div className="p-4">
          <Card className="rounded-2xl shadow-sm">
            <CardContent className="p-6 text-center text-sm text-zinc-600 dark:text-zinc-400">
              {error ?? "Job not found."}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const view = bookingRowToMobileView(row);
  const phase = deriveMobilePhase(row);
  const statusLabel =
    phase === "completed"
      ? "Completed"
      : phase === "in_progress"
        ? "In progress"
        : phase === "en_route"
          ? "On the way"
          : phase === "pending"
            ? "Being processed"
            : "Assigned";

  const showLifecycleActions = phase !== "completed";
  const isTeam = row.is_team_job === true;
  const lifecycleSlot = deriveCleanerJobLifecycleSlot(row);

  const telDigits = view.phone.replace(/\s/g, "");
  const telHref = telDigits ? `tel:${telDigits}` : null;
  const phoneDisplay = view.phone?.trim() || "";
  const mapsDirUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(view.address)}`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/cleaner"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to home
        </Link>
        <h1 className="mt-3 text-lg font-semibold text-zinc-900 dark:text-zinc-50">Job details</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4">
        <Card className="rounded-2xl shadow-sm">
          <CardContent className="space-y-4 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{statusLabel}</Badge>
              {row.is_team_job ? (
                <Badge variant="outline" className="font-normal">
                  Team job
                </Badge>
              ) : null}
              {row.is_team_job && row.is_lead_cleaner ? (
                <Badge className="border-violet-200 bg-violet-100 font-medium text-violet-950 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950/50 dark:text-violet-100">
                  Team lead
                </Badge>
              ) : null}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{view.customerName}</h2>
              {phoneDisplay ? (
                <p className="mt-1.5 text-sm">
                  {telHref ? (
                    <a
                      href={telHref}
                      className="font-medium text-blue-600 underline-offset-2 hover:underline dark:text-blue-400"
                    >
                      {phoneDisplay}
                    </a>
                  ) : (
                    <span className="font-medium text-zinc-800 dark:text-zinc-200">{phoneDisplay}</span>
                  )}
                </p>
              ) : null}
              <CleanerJobEarningsRow
                className="mt-3"
                service={view.service}
                earningsZar={view.earningsZar}
                earningsCents={view.earningsCents}
                earningsIsEstimate={view.earningsIsEstimate}
                cleanerCreatedAtIso={cleanerCreatedAtIso}
                jobTotalZar={jobTotalZarFromCleanerBookingLike(row)}
                durationHours={view.durationHours}
                isTeamJob={view.isTeamJob}
                teamMemberCount={view.teamMemberCount}
                showServiceColumn={false}
                teamStatusSlot={
                  row.is_team_job ? (
                    <>
                      <p className="font-medium text-zinc-900 dark:text-zinc-50">
                        {teamJobAssignmentHeadline(
                          typeof row.teamMemberCount === "number" ? row.teamMemberCount : null,
                        )}
                      </p>
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
                    </>
                  ) : null
                }
              />
            </div>
            <div className="flex items-start gap-2 text-sm text-zinc-700 dark:text-zinc-200">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" aria-hidden />
              <span>{view.address}</span>
            </div>
            {view.service?.trim() ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                <span className="font-semibold uppercase tracking-wide">Service</span> · {view.service.trim()}
              </p>
            ) : null}
            {view.scopeLines.length > 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Cleaning includes:</p>
                <ul className="mt-2 list-inside list-disc space-y-1 text-zinc-800 dark:text-zinc-100">
                  {view.scopeLines.map((line, i) => (
                    <li key={`${i}-${line}`}>{line}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {row.is_team_job && Array.isArray(row.team_roster) && row.team_roster.length > 0 ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Team on this job</p>
                <ul className="mt-2 space-y-2">
                  {row.team_roster.map((m) => (
                    <li key={m.cleaner_id} className="flex flex-wrap items-center gap-2 text-zinc-800 dark:text-zinc-100">
                      <span className="font-medium">{m.full_name?.trim() || "Cleaner"}</span>
                      {m.role === "lead" ? (
                        <Badge variant="outline" className="text-[10px] font-semibold uppercase tracking-wide">
                          Lead
                        </Badge>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Date</p>
                <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{view.date || "—"}</p>
              </div>
              <div className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-800/80">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Time</p>
                <p className="mt-1 font-semibold text-zinc-900 dark:text-zinc-50">{view.time}</p>
              </div>
            </div>
            {view.operationalNoteChips.length > 0 || view.notes ? (
              <div className="rounded-xl border border-zinc-200 bg-zinc-50/80 p-3 text-sm dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="text-xs font-semibold uppercase text-zinc-500">Notes</p>
                {view.operationalNoteChips.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {view.operationalNoteChips.map((c) => (
                      <Badge
                        key={c}
                        variant="outline"
                        className="border-amber-300/80 bg-amber-50 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                      >
                        {c}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                {view.notes ? (
                  <p className="mt-2 whitespace-pre-wrap text-zinc-800 dark:text-zinc-100">{view.notes}</p>
                ) : null}
              </div>
            ) : null}
            {actionMsg ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100">
                {actionMsg}
              </p>
            ) : null}

            {showLifecycleActions ? (
              <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-zinc-500">On-site help</p>
                {row.cleaner_has_issue_report === true ? (
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-200">
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    Issue reported — you can add another note below if something changed.
                  </p>
                ) : null}
                <CleanerReportJobIssueDialog
                  bookingId={id}
                  locationHint={view.address}
                  onSuccess={() => void load({ silent: true })}
                />
              </div>
            ) : null}

            {trustCompletion ? <CleanerJobCompletionTrustBanner feedback={trustCompletion} /> : null}
            {earningsConfirmedCents != null ? (
              <CleanerEarningsConfirmedBanner cents={earningsConfirmedCents} className="mt-2" />
            ) : null}
            {phase === "completed" && !trustCompletion ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100">
                {isBookingPayoutPaid({
                  payout_status: (row as { payout_status?: string | null }).payout_status,
                  payout_paid_at: (row as { payout_paid_at?: string | null }).payout_paid_at,
                })
                  ? "Marked paid in your earnings."
                  : "See Earnings for payout status."}
              </p>
            ) : null}

            <div className="sticky bottom-0 z-10 -mx-4 border-t border-zinc-100 bg-white/95 px-4 py-3 shadow-[0_-8px_32px_-14px_rgba(0,0,0,0.12)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 md:static md:mx-0 md:border-0 md:bg-transparent md:px-0 md:py-0 md:shadow-none md:backdrop-blur-none">
              <div className="flex flex-col gap-2.5">
                {showLifecycleActions && lifecycleSlot?.kind === "accept_reject" ? (
                  <div className="flex w-full gap-2">
                    {lifecycleSlot.canReject ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-14 min-h-14 flex-1 rounded-xl border-red-300 text-base font-semibold text-red-800 hover:bg-red-50 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
                        disabled={acting}
                        onClick={() => void postJobAction("reject")}
                      >
                        Decline
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      className={cn(
                        "h-14 min-h-14 rounded-xl text-base font-semibold text-white shadow-sm",
                        "bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500",
                        lifecycleSlot.canReject ? "flex-1" : "w-full",
                      )}
                      disabled={acting}
                      onClick={() => void postJobAction("accept")}
                    >
                      {acting ? "Saving…" : isTeam ? "Confirm availability" : "Accept"}
                    </Button>
                  </div>
                ) : null}
                {showLifecycleActions && lifecycleSlot?.kind === "en_route" ? (
                  <Button
                    type="button"
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                    disabled={acting}
                    onClick={async () => {
                      const r = await postJobAction("en_route");
                      if (r.ok) {
                        window.open(mapsDirUrl, "_blank", "noopener,noreferrer");
                      }
                    }}
                  >
                    <Navigation className="h-5 w-5 shrink-0" aria-hidden />
                    {acting ? "Saving…" : "Navigate & On My Way"}
                  </Button>
                ) : null}
                {showLifecycleActions && lifecycleSlot?.kind === "start" ? (
                  <Button
                    type="button"
                    className="h-14 w-full rounded-xl bg-blue-600 text-base font-semibold text-white shadow-sm hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                    disabled={acting}
                    onClick={() => void postJobAction("start")}
                  >
                    {acting ? "Saving…" : "Start Job"}
                  </Button>
                ) : null}
                {showLifecycleActions && lifecycleSlot?.kind === "complete" ? (
                  <Button
                    type="button"
                    className="h-14 w-full rounded-xl bg-emerald-600 text-base font-semibold text-white shadow-sm hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500"
                    disabled={acting}
                    onClick={() => void postJobAction("complete")}
                  >
                    {acting ? "Saving…" : "Complete Job"}
                  </Button>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
