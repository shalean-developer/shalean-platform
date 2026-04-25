"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { buildCleanerOfferAcceptBody } from "@/lib/cleaner/cleanerOfferUxVariant";
import { reportDispatchOfferExposed } from "@/lib/cleaner/reportDispatchOfferExposed";
import { getSupabaseBrowser } from "@/lib/supabase/browser";
import { checkoutPriceLinesFromPersisted, priceZarFromPersisted } from "@/lib/dashboard/bookingUtils";
import { AvailableJobsEmptyState } from "@/components/cleaner/AvailableJobsEmptyState";
import { formatCleanerAvailabilityConfirmedMessage } from "@/lib/cleaner/cleanerAvailabilityConfirmedCopy";
import type { CleanerBookingRow } from "@/lib/cleaner/cleanerBookingRow";
import { deriveMobilePhase } from "@/lib/cleaner/cleanerMobileBookingMap";
import { addTeamAvailabilityAck, readTeamAvailabilityAckSet } from "@/lib/cleaner/teamAvailabilitySession";
import { teamSelfAvailabilityChip } from "@/lib/cleaner/teamAvailabilityUi";
import { TEAM_JOB_ROLE_SUBTEXT, teamJobAssignmentHeadline } from "@/lib/cleaner/teamJobUiCopy";

type JobRow = {
  id: string;
  service: string | null;
  date: string | null;
  time: string | null;
  location: string | null;
  status: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  total_paid_zar: number | null;
  total_price?: number | string | null;
  price_breakdown?: Record<string, unknown> | null;
  pricing_version_id?: string | null;
  amount_paid_cents?: number | null;
  extras?: unknown[] | null;
  assigned_at: string | null;
  en_route_at?: string | null;
  started_at?: string | null;
  is_team_job?: boolean | null;
  team_id?: string | null;
  cleaner_id?: string | null;
  displayEarningsCents?: number | null;
  teamMemberCount?: number | null;
};

function formatZar(zar: number): string {
  const n = Math.round(zar);
  const abs = Math.abs(n).toLocaleString("en-ZA");
  if (n < 0) return `−R ${abs}`;
  return `R ${abs}`;
}

function cleanerExtrasRequiredLines(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === "string") {
      const s = item.trim();
      if (s) out.push(s);
      continue;
    }
    if (item && typeof item === "object") {
      const o = item as Record<string, unknown>;
      const name = typeof o.name === "string" ? o.name.trim() : "";
      const slug = typeof o.slug === "string" ? o.slug.trim() : "";
      const price = typeof o.price === "number" && Number.isFinite(o.price) ? Math.round(o.price) : null;
      if (name) out.push(price != null ? `${name} (R${price.toLocaleString("en-ZA")})` : name);
      else if (slug) out.push(slug);
    }
  }
  return out;
}

type OfferRow = {
  id: string;
  booking_id: string;
  status: string;
  expires_at: string;
  created_at: string;
  ux_variant?: string | null;
  displayEarningsCents?: number | null;
  booking: {
    id: string;
    service: string | null;
    date: string | null;
    time: string | null;
    location: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    status: string | null;
    is_team_job?: boolean;
    team_id?: string | null;
  } | null;
};

export default function CleanerJobsPage() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [realtimeCtx, setRealtimeCtx] = useState<{ cleanerId: string; teamIds: string[] } | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [teamAvailabilityAckIds, setTeamAvailabilityAckIds] = useState<Set<string>>(() => new Set());

  const load = useCallback(async () => {
    const sb = getSupabaseBrowser();
    if (!sb) {
      setError("Sign-in is not available.");
      setLoading(false);
      return;
    }
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      router.replace("/auth/login?next=/cleaner/jobs");
      return;
    }
    const [jobsRes, offersRes, meRes] = await Promise.all([
      fetch("/api/cleaner/jobs", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/cleaner/offers", { headers: { Authorization: `Bearer ${token}` } }),
      fetch("/api/cleaner/me", { headers: { Authorization: `Bearer ${token}` } }),
    ]);
    const j = (await jobsRes.json()) as { jobs?: JobRow[]; error?: string };
    const o = (await offersRes.json()) as { offers?: OfferRow[]; error?: string };
    const me = (await meRes.json()) as { cleaner?: { id?: string }; teamIds?: string[] };
    if (!jobsRes.ok) {
      setError(j.error ?? "Could not load jobs.");
      setJobs([]);
      setOffers([]);
      setRealtimeCtx(null);
      setLoading(false);
      return;
    }
    setError(null);
    setJobs(j.jobs ?? []);
    setOffers(offersRes.ok ? (o.offers ?? []) : []);
    if (meRes.ok && me.cleaner?.id) {
      setRealtimeCtx({
        cleanerId: String(me.cleaner.id),
        teamIds: Array.isArray(me.teamIds)
          ? me.teamIds.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
          : [],
      });
    } else {
      setRealtimeCtx(null);
    }
    setLoading(false);
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!actionNotice) return;
    const t = window.setTimeout(() => setActionNotice(null), 5200);
    return () => window.clearTimeout(t);
  }, [actionNotice]);

  useEffect(() => {
    setTeamAvailabilityAckIds(readTeamAvailabilityAckSet());
  }, []);

  useEffect(() => {
    const t = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const topOfferId = offers[0]?.id;
  useEffect(() => {
    if (!topOfferId) return;
    void (async () => {
      const sb = getSupabaseBrowser();
      const token = (await sb?.auth.getSession())?.data.session?.access_token;
      if (!token) return;
      reportDispatchOfferExposed(topOfferId, { Authorization: `Bearer ${token}` });
    })();
  }, [topOfferId]);

  useEffect(() => {
    const sb = getSupabaseBrowser();
    if (!sb || !realtimeCtx?.cleanerId) return;

    let cancelled = false;
    let ch: ReturnType<typeof sb.channel> | null = null;
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled || !data.session) return;
      const cid = realtimeCtx.cleanerId;
      ch = sb.channel(`cleaner-bookings-${cid}`);
      ch.on(
        "postgres_changes",
        { event: "*", schema: "public", table: "bookings", filter: `cleaner_id=eq.${cid}` },
        () => {
          void load();
        },
      );
      for (const tid of realtimeCtx.teamIds) {
        if (!tid.trim()) continue;
        ch.on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bookings", filter: `team_id=eq.${tid}` },
          () => {
            void load();
          },
        );
      }
      ch.subscribe();
    });

    return () => {
      cancelled = true;
      if (ch) void sb.removeChannel(ch);
    };
  }, [load, realtimeCtx]);

  async function runAction(
    bookingId: string,
    action: string,
    meta?: { teamAvailabilityConfirm?: boolean; date?: string | null; time?: string | null },
  ) {
    setActingId(bookingId);
    const sb = getSupabaseBrowser();
    const { data: sessionData } = await sb?.auth.getSession() ?? { data: { session: null } };
    const token = sessionData.session?.access_token;
    if (!token) {
      setActingId(null);
      return;
    }
    const res = await fetch(`/api/cleaner/jobs/${encodeURIComponent(bookingId)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    setActingId(null);
    if (res.ok) {
      if (meta?.teamAvailabilityConfirm === true && action === "accept") {
        addTeamAvailabilityAck(bookingId);
        setTeamAvailabilityAckIds(readTeamAvailabilityAckSet());
        setActionNotice(formatCleanerAvailabilityConfirmedMessage(meta.date, meta.time));
      }
      void load();
    }
  }

  async function respondToOffer(offerId: string, action: "accept" | "decline", uxVariant?: string | null) {
    setActingId(offerId);
    const sb = getSupabaseBrowser();
    const { data: sessionData } = (await sb?.auth.getSession()) ?? { data: { session: null } };
    const token = sessionData.session?.access_token;
    if (!token) {
      setActingId(null);
      return;
    }
    const resolvedUx = uxVariant ?? offers.find((o) => o.id === offerId)?.ux_variant;
    const res = await fetch(`/api/cleaner/offers/${encodeURIComponent(offerId)}/${action}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(action === "accept" ? buildCleanerOfferAcceptBody(resolvedUx) : {}),
    });
    setActingId(null);
    if (res.ok) void load();
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-center text-sm text-zinc-500">Loading jobs…</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto max-w-lg px-4 py-10">
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
          {error}
        </p>
      </main>
    );
  }

  const list = jobs ?? [];
  const availableOffers = offers.filter((o) => o.booking == null || o.booking.is_team_job !== true);
  const activeOffer = availableOffers[0] ?? null;
  const activeOfferDisplayZar =
    activeOffer?.displayEarningsCents != null && Number.isFinite(Number(activeOffer.displayEarningsCents))
      ? Math.round(Number(activeOffer.displayEarningsCents) / 100)
      : null;
  const secondsLeft = activeOffer
    ? Math.max(0, Math.floor((new Date(activeOffer.expires_at).getTime() - nowMs) / 1000))
    : 0;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">My Jobs</h1>
      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
        Updates appear automatically when operations assigns work.
      </p>

      {actionNotice ? (
        <p
          className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/35 dark:text-emerald-100"
          role="status"
        >
          {actionNotice}
        </p>
      ) : null}

      {activeOffer ? (
        <section className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">Available Jobs</p>
          <p className="mt-1 text-base font-semibold text-zinc-900 dark:text-zinc-50">
            {activeOffer.booking?.service ?? "Cleaning job"}
          </p>
          <p className="text-sm text-zinc-700 dark:text-zinc-300">
            {activeOffer.booking?.date ?? "—"} {activeOffer.booking?.time ?? ""}
            {activeOffer.booking?.location ? ` · ${activeOffer.booking.location}` : ""}
          </p>
          <p className="mt-2 text-sm font-medium text-amber-900 dark:text-amber-100">Respond in {secondsLeft}s</p>
          <p className="mt-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {activeOfferDisplayZar != null
              ? `You will earn R${activeOfferDisplayZar.toLocaleString("en-ZA")}`
              : "Earnings unavailable"}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={actingId === activeOffer.id || activeOfferDisplayZar == null}
              onClick={() => void respondToOffer(activeOffer.id, "accept", activeOffer.ux_variant)}
              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
            >
              {actingId === activeOffer.id ? "Saving..." : "Accept"}
            </button>
            <button
              type="button"
              disabled={actingId === activeOffer.id}
              onClick={() => void respondToOffer(activeOffer.id, "decline")}
              className="rounded-lg border border-rose-300 px-3 py-2 text-xs font-semibold text-rose-800 disabled:opacity-60 dark:border-rose-800 dark:text-rose-200"
            >
              Decline
            </button>
          </div>
        </section>
      ) : (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available Jobs</p>
          <AvailableJobsEmptyState />
        </div>
      )}

      {list.length === 0 ? (
        <p className="mt-8 text-center text-sm text-zinc-500">No jobs yet — stay available to receive assignments.</p>
      ) : (
        <ul className="mt-6 space-y-4" aria-label="My jobs list">
          {list.map((j) => {
            const st = (j.status ?? "").toLowerCase();
            const busy = actingId === j.id;
            const isTeam = j.is_team_job === true;
            const phase = deriveMobilePhase(j as CleanerBookingRow);
            const teamAcked = teamAvailabilityAckIds.has(j.id);
            const availChip = isTeam ? teamSelfAvailabilityChip(phase, teamAcked) : null;
            const extrasLines = cleanerExtrasRequiredLines(j.extras);
            const priceLines = checkoutPriceLinesFromPersisted({
              total_price: j.total_price ?? null,
              price_breakdown: j.price_breakdown ?? null,
              pricing_version_id: j.pricing_version_id ?? null,
              total_paid_zar: j.total_paid_zar ?? null,
              amount_paid_cents: j.amount_paid_cents ?? null,
            });
            const totalZar = priceZarFromPersisted({
              total_price: j.total_price ?? null,
              price_breakdown: j.price_breakdown ?? null,
              total_paid_zar: j.total_paid_zar ?? null,
              amount_paid_cents: j.amount_paid_cents ?? null,
            });
            const displayZar =
              j.displayEarningsCents != null && Number.isFinite(Number(j.displayEarningsCents))
                ? Math.round(Number(j.displayEarningsCents) / 100)
                : null;
            return (
              <li
                key={j.id}
                className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-50">{j.service ?? "Cleaning"}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-300">
                      {j.date} {j.time}
                    </p>
                    {j.location ? (
                      <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{j.location}</p>
                    ) : null}
                    {extrasLines.length > 0 ? (
                      <div className="mt-3 rounded-lg border border-amber-200/90 bg-amber-50/90 px-3 py-2 dark:border-amber-900/50 dark:bg-amber-950/30">
                        <p className="text-xs font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
                          Extras required
                        </p>
                        <ul className="mt-1 list-inside list-disc text-sm text-zinc-800 dark:text-zinc-200">
                          {extrasLines.map((line, idx) => (
                            <li key={`${j.id}-extra-${idx}`}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                    {priceLines ? (
                      <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900/50">
                        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-700 dark:text-zinc-300">
                          Customer price breakdown
                        </p>
                        <ul className="mt-2 space-y-1.5 text-sm text-zinc-800 dark:text-zinc-200">
                          {priceLines.map((line) => (
                            <li key={`${j.id}-price-${line.kind}`} className="flex justify-between gap-3 tabular-nums">
                              <span className="text-zinc-600 dark:text-zinc-400">{line.label}</span>
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">{formatZar(line.amountZar)}</span>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 border-t border-zinc-200 pt-2 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-50 dark:border-zinc-700">
                          <span className="font-normal text-zinc-600 dark:text-zinc-400">Total</span>{" "}
                          {formatZar(totalZar)}
                        </p>
                      </div>
                    ) : (
                      <p className="mt-3 text-sm font-medium tabular-nums text-zinc-800 dark:text-zinc-200">
                        Total paid: {formatZar(j.total_paid_zar ?? 0)}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-zinc-500">
                      {j.customer_name ?? "Customer"} · {j.customer_phone ?? "—"}
                    </p>
                    <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      {displayZar != null
                        ? `You will earn R${displayZar.toLocaleString("en-ZA")}`
                        : "Earnings unavailable"}
                    </p>
                    {isTeam && availChip ? (
                      <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/90 px-3 py-2 text-sm dark:border-blue-900/50 dark:bg-blue-950/35">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-zinc-900 dark:text-zinc-50">
                            {teamJobAssignmentHeadline(
                              typeof j.teamMemberCount === "number" ? j.teamMemberCount : null,
                            )}
                          </p>
                          <span
                            className={[
                              "rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
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
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">{TEAM_JOB_ROLE_SUBTEXT}</p>
                      </div>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    {j.status ?? "—"}
                  </span>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {st === "assigned" ? (
                    <>
                      <button
                        type="button"
                        disabled={busy || (isTeam && teamAcked)}
                        onClick={() =>
                          void runAction(j.id, "accept", {
                            teamAvailabilityConfirm: isTeam,
                            date: j.date,
                            time: j.time,
                          })
                        }
                        className="rounded-lg bg-zinc-200 px-3 py-2 text-xs font-semibold text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                      >
                        {isTeam ? (teamAcked ? "Availability saved" : "Confirm availability") : "Acknowledge"}
                      </button>
                      {!isTeam ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(j.id, "reject")}
                        className="rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-800 dark:border-red-800 dark:text-red-200"
                      >
                        Reject
                      </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(j.id, "en_route")}
                        className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold text-white"
                      >
                        On the way
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void runAction(j.id, "start")}
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                      >
                        Start job
                      </button>
                    </>
                  ) : null}
                  {st === "in_progress" ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void runAction(j.id, "complete")}
                      className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white"
                    >
                      Complete
                    </button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
