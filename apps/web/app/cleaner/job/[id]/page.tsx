"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, MapPin, Navigation } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { cleanerAuthenticatedFetch } from "@/lib/cleaner/cleanerAuthenticatedFetch";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { bookingRowToMobileView, deriveMobilePhase } from "@/lib/cleaner/cleanerMobileBookingMap";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";
import { addTeamAvailabilityAck, readTeamAvailabilityAckSet } from "@/lib/cleaner/teamAvailabilitySession";
import type { CleanerJobAction } from "@/hooks/useCleanerMobileWorkspace";
import { CleanerJobEarningsRow } from "@/components/cleaner/mobile/CleanerJobEarningsRow";
import { getSupabaseBrowser } from "@/lib/supabase/browser";

export default function CleanerJobDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [row, setRow] = useState<CleanerBookingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [ackTick, setAckTick] = useState(0);
  const rtDebounceRef = useRef<number | null>(null);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent === true;
    const headers = await getCleanerAuthHeaders();
    if (!headers || !id) {
      setError("Not signed in.");
      setRow(null);
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    const res = await cleanerAuthenticatedFetch(`/api/cleaner/jobs/${encodeURIComponent(id)}`, { headers });
    if (!silent) setLoading(false);
    const json = (await res.json()) as { job?: CleanerBookingRow; error?: string };
    if (!res.ok) {
      setError(json.error ?? "Could not load job.");
      setRow(null);
      return;
    }
    setError(null);
    setRow(json.job ?? null);
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

  const availabilityAcked = useMemo(() => {
    void ackTick;
    return id ? readTeamAvailabilityAckSet().has(id) : false;
  }, [id, ackTick]);

  const postJobAction = useCallback(
    async (action: CleanerJobAction) => {
      const headers = await getCleanerAuthHeaders();
      if (!headers || !id) {
        setActionMsg("Not signed in.");
        return;
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
          return;
        }
        if (action === "accept" && row?.is_team_job === true) {
          addTeamAvailabilityAck(id);
          setAckTick((t) => t + 1);
        }
        await load({ silent: true });
      } catch {
        setActionMsg("Network error.");
      } finally {
        setActing(false);
      }
    },
    [id, load, row],
  );

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
            href="/cleaner/dashboard"
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
          : "Assigned";

  const showLifecycleActions = phase !== "completed";
  const isTeam = row.is_team_job === true;

  const telDigits = view.phone.replace(/\s/g, "");
  const telHref = telDigits ? `tel:${telDigits}` : null;
  const phoneDisplay = view.phone?.trim() || "";
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(view.address)}`;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-zinc-50 dark:bg-zinc-950">
      <header className="shrink-0 border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900">
        <Link
          href="/cleaner/dashboard"
          className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 dark:text-blue-400"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to dashboard
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
                earningsIsEstimate={view.earningsIsEstimate}
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

            {phase === "completed" ? (
              <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100">
                {row.payout_id
                  ? "Job completed — your earnings are recorded for payout."
                  : "Job completed — payout will appear in earnings once processed."}
              </p>
            ) : null}

            <div className="flex flex-col gap-2.5 pt-2">
              {showLifecycleActions && phase === "in_progress" ? (
                <Button
                  className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                  disabled={acting}
                  onClick={() => void postJobAction("complete")}
                >
                  <span className="flex w-full items-center justify-center gap-1">
                    {acting ? "Saving…" : "Complete job"}
                    {!acting ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </span>
                </Button>
              ) : null}
              {showLifecycleActions && isTeam && phase === "assigned" && !availabilityAcked ? (
                <Button
                  className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                  disabled={acting}
                  onClick={() => void postJobAction("accept")}
                >
                  <span className="flex w-full items-center justify-center gap-1">
                    {acting ? "Saving…" : "Confirm availability"}
                    {!acting ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </span>
                </Button>
              ) : null}
              {showLifecycleActions && phase === "assigned" && (!isTeam || availabilityAcked) ? (
                <Button
                  className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                  disabled={acting}
                  onClick={() => void postJobAction("en_route")}
                >
                  <span className="flex w-full items-center justify-center gap-1">
                    {acting ? "Saving…" : "On the way"}
                    {!acting ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </span>
                </Button>
              ) : null}
              {showLifecycleActions && phase === "en_route" ? (
                <Button
                  className="h-12 w-full rounded-xl bg-blue-600 text-base font-medium text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                  disabled={acting}
                  onClick={() => void postJobAction("start")}
                >
                  <span className="flex w-full items-center justify-center gap-1">
                    {acting ? "Saving…" : "Start job"}
                    {!acting ? <ChevronRight className="h-4 w-4 shrink-0" aria-hidden /> : null}
                  </span>
                </Button>
              ) : null}

              <Button variant="outline" size="lg" className="h-12 w-full rounded-xl text-base" asChild>
                <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
                  <Navigation className="h-4 w-4" aria-hidden />
                  Open directions
                </a>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
