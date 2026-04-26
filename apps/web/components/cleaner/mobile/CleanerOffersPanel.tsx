"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Clock, Loader2, MapPin, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import {
  cleanerOfferAcceptCta,
  cleanerOfferHeadline,
  getCleanerOfferUxConfigFromPersisted,
} from "@/lib/cleaner/cleanerOfferUxVariant";
import { getCleanerIdHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { reportDispatchOfferExposed } from "@/lib/cleaner/reportDispatchOfferExposed";
import { CleanerJobEarningsRow } from "@/components/cleaner/mobile/CleanerJobEarningsRow";
import { durationHoursFromBookingSnapshot } from "@/lib/cleaner/cleanerMobileBookingMap";
import {
  drivingEtaMinutesFromOfferSnapshot,
  formatOfferTravelDecisionHint,
} from "@/lib/cleaner/cleanerOfferValue";
import { cn } from "@/lib/utils";

function formatMmSs(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

/** Three-tier countdown styling (fixed thresholds; complements A/B `ux` sound/headline). */
function offerUrgencyLevel(secLeft: number): "normal" | "high" | "critical" {
  if (secLeft <= 0) return "normal";
  if (secLeft <= 30) return "critical";
  if (secLeft <= 90) return "high";
  return "normal";
}

function playOfferPing(): void {
  try {
    const AC =
      typeof window !== "undefined"
        ? (window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : null;
    if (!AC) return;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.connect(g);
    g.connect(ctx.destination);
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.035, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0008, ctx.currentTime + 0.07);
    o.start(ctx.currentTime);
    o.stop(ctx.currentTime + 0.08);
    void ctx.close();
  } catch {
    /* ignore */
  }
}

/** Stronger two-tone ping when countdown enters the critical window (≤30s). */
function playOfferCriticalPing(): void {
  try {
    const AC =
      typeof window !== "undefined"
        ? (window.AudioContext ||
            (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : null;
    if (!AC) return;
    const ctx = new AC();
    for (let i = 0; i < 2; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.connect(g);
      g.connect(ctx.destination);
      o.frequency.value = i === 0 ? 720 : 960;
      const t0 = ctx.currentTime + i * 0.1;
      g.gain.setValueAtTime(0.05, t0);
      g.gain.exponentialRampToValueAtTime(0.0008, t0 + 0.11);
      o.start(t0);
      o.stop(t0 + 0.11);
    }
    window.setTimeout(() => void ctx.close(), 400);
  } catch {
    /* ignore */
  }
}

export function CleanerOffersPanel({
  offer,
  busy,
  busyOfferId,
  primaryOfferBadge = null,
  moreJobsTodayCount = 0,
  onAccept,
  onDecline,
  onAcceptSuccess,
  hideSectionHeading = false,
}: {
  offer: CleanerOfferRow | null | undefined;
  busy: boolean;
  /** When set, spinners/disabled state apply only to this offer id. */
  busyOfferId?: string | null;
  /** One of: best value (multi-offer queue) or recommended (close + strong value); never both. */
  primaryOfferBadge?: "best_value" | "recommended" | null;
  /** Other solo offers dated today (batching nudge). */
  moreJobsTodayCount?: number;
  onAccept: (offerId: string, uxVariant?: string | null) => Promise<boolean>;
  onDecline: (offerId: string) => Promise<void>;
  /** Fires with booking id after accept succeeds (scroll / highlight in parent). */
  onAcceptSuccess?: (bookingId: string) => void;
  /** Parent already shows “Available jobs” section title. */
  hideSectionHeading?: boolean;
}) {
  const [secLeft, setSecLeft] = useState(0);
  const [celebrate, setCelebrate] = useState(false);
  const [missedZar, setMissedZar] = useState<number | null>(null);
  const alertedOfferIdRef = useRef<string | null>(null);
  const criticalChimedRef = useRef(false);
  const prevSecRef = useRef<number | null>(null);
  const ux = useMemo(() => getCleanerOfferUxConfigFromPersisted(offer?.ux_variant), [offer?.ux_variant]);

  const mutatingThisOffer = Boolean(busy && busyOfferId && offer?.id && busyOfferId === offer.id);

  useEffect(() => {
    if (!offer?.id) {
      prevSecRef.current = null;
      return;
    }
    const cents = offer.displayEarningsCents;
    const zar =
      cents != null && Number.isFinite(Number(cents)) ? Math.round(Math.max(0, Number(cents)) / 100) : null;
    const prev = prevSecRef.current;
    prevSecRef.current = secLeft;
    if (prev != null && prev > 0 && secLeft === 0 && zar != null) {
      setMissedZar(zar);
      const t = window.setTimeout(() => setMissedZar(null), 2000);
      return () => clearTimeout(t);
    }
  }, [secLeft, offer?.id, offer?.displayEarningsCents]);

  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(() => setCelebrate(false), 2200);
    return () => window.clearTimeout(t);
  }, [celebrate]);

  useEffect(() => {
    if (offer?.id) setCelebrate(false);
    prevSecRef.current = null;
  }, [offer?.id]);

  useEffect(() => {
    criticalChimedRef.current = false;
  }, [offer?.id]);

  useEffect(() => {
    if (secLeft > 30) {
      criticalChimedRef.current = false;
      return;
    }
    if (!ux.sound || !offer?.id) return;
    if (secLeft <= 0 || secLeft > 30) return;
    if (criticalChimedRef.current) return;
    criticalChimedRef.current = true;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([20, 40, 24, 40, 20]);
    }
    playOfferCriticalPing();
  }, [secLeft, ux.sound, offer?.id]);

  useEffect(() => {
    if (!offer?.id) return;
    const headers = getCleanerIdHeaders();
    if (headers) reportDispatchOfferExposed(offer.id, headers);
  }, [offer?.id]);

  useEffect(() => {
    if (!offer?.id) return;
    if (alertedOfferIdRef.current === offer.id) return;
    alertedOfferIdRef.current = offer.id;
    if (!ux.sound) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([16, 36, 20]);
    }
    playOfferPing();
  }, [offer?.id, ux.sound]);

  useEffect(() => {
    if (!offer?.expires_at) {
      setSecLeft(0);
      return;
    }
    const tick = () => {
      const end = new Date(offer.expires_at).getTime();
      setSecLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [offer?.expires_at, offer?.id]);

  if (celebrate) {
    return (
      <div className={cn("space-y-2", hideSectionHeading ? "mb-0" : "mb-4")}>
        {hideSectionHeading ? null : (
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available Jobs</p>
        )}
        <Card className="rounded-2xl border border-emerald-200 bg-emerald-50/95 shadow-sm dark:border-emerald-900/50 dark:bg-emerald-950/40">
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white dark:bg-emerald-500">
              <Check className="h-6 w-6" strokeWidth={2.5} aria-hidden />
            </div>
            <p className="text-lg font-bold text-emerald-800 dark:text-emerald-100">Accepted ✓</p>
            <p className="text-sm text-zinc-600 dark:text-zinc-300">We&apos;re adding this job to your schedule.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!offer) {
    if (hideSectionHeading && missedZar == null) return null;
    return (
      <div className={cn("space-y-2", hideSectionHeading ? "mb-0" : "mb-4")}>
        {missedZar != null ? (
          <p
            className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
            role="status"
          >
            You missed a R{missedZar.toLocaleString("en-ZA")} job — another one could come soon
          </p>
        ) : null}
        {hideSectionHeading ? null : (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available Jobs</p>
            <div className="rounded-2xl border border-zinc-200 bg-zinc-50/90 px-4 py-5 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">No available jobs right now</p>
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">We&apos;ll notify you when new work is available.</p>
            </div>
          </>
        )}
      </div>
    );
  }

  if (!offer.booking) return null;
  if (offer.booking.is_team_job === true) return null;

  const b = offer.booking;
  const displayEarningsCents =
    offer.displayEarningsCents != null && Number.isFinite(Number(offer.displayEarningsCents))
      ? Math.max(0, Math.round(Number(offer.displayEarningsCents)))
      : null;
  const displayEarningsZar = displayEarningsCents != null ? Math.round(displayEarningsCents / 100) : null;
  const displayEarningsIsEstimate = offer.displayEarningsIsEstimate === true;
  const offerDurationHours = durationHoursFromBookingSnapshot(b.booking_snapshot);
  const teamMemberCount =
    typeof b.teamMemberCount === "number" && Number.isFinite(b.teamMemberCount) && b.teamMemberCount > 0
      ? Math.floor(b.teamMemberCount)
      : null;

  const etaMin = drivingEtaMinutesFromOfferSnapshot(offer);
  const travelHint = formatOfferTravelDecisionHint(etaMin, secLeft);
  const travelLine = travelHint ?? (etaMin == null ? "📍 Nearby job" : null);

  const urgencyTier = secLeft > 0 ? offerUrgencyLevel(secLeft) : "normal";
  const urgencyRing =
    urgencyTier === "critical"
      ? "animate-pulse ring-2 ring-rose-400/80 shadow-lg shadow-rose-900/10 dark:ring-rose-500/50"
      : urgencyTier === "high"
        ? "ring-2 ring-amber-400/70 shadow-md dark:ring-amber-500/40"
        : "";

  async function handleAccept(): Promise<void> {
    if (!offer?.id) return;
    const bookingId = offer.booking_id;
    const ok = await onAccept(offer.id, offer.ux_variant ?? null);
    if (ok) {
      onAcceptSuccess?.(bookingId);
      setCelebrate(true);
    }
  }

  return (
    <div className={cn("space-y-2", hideSectionHeading ? "mb-0" : "mb-4")}>
      {missedZar != null ? (
        <p
          className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-medium text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100"
          role="status"
        >
          You missed a R{missedZar.toLocaleString("en-ZA")} job — another one could come soon
        </p>
      ) : null}
      {hideSectionHeading ? null : (
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available Jobs</p>
      )}
      {moreJobsTodayCount > 0 ? (
        <p className="text-xs font-medium text-blue-700 dark:text-blue-300">
          {moreJobsTodayCount} more job{moreJobsTodayCount === 1 ? "" : "s"} available — earn more today
        </p>
      ) : null}
      <Card
        className={cn(
          "rounded-2xl border-amber-200 bg-amber-50/90 shadow-sm transition-shadow duration-300 dark:border-amber-900/50 dark:bg-amber-950/35",
          urgencyRing,
        )}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="warning" className="gap-1 font-semibold">
                <Zap className="h-3 w-3" aria-hidden />
                New offer
              </Badge>
              {primaryOfferBadge === "best_value" ? (
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Best value</span>
              ) : primaryOfferBadge === "recommended" ? (
                <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Recommended</span>
              ) : null}
            </div>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-bold tabular-nums",
                secLeft <= 0 && "bg-zinc-200/90 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
                secLeft > 0 && urgencyTier === "critical" && "bg-rose-600 text-white dark:bg-rose-700",
                secLeft > 0 && urgencyTier === "high" && "bg-amber-500 text-amber-950 dark:bg-amber-600 dark:text-amber-50",
                secLeft > 0 && urgencyTier === "normal" && "bg-zinc-200/90 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100",
              )}
              aria-live="polite"
            >
              <Clock className="h-3.5 w-3.5" aria-hidden />
              {formatMmSs(secLeft)}
            </span>
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {cleanerOfferHeadline(ux)}
            </h2>
            <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-200">
              {b.customer_name?.trim() || "Customer"} · {b.service ?? "Cleaning"}
            </p>
            <p className="mt-1 flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-300">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-800 dark:text-amber-200" aria-hidden />
              <span>{b.location?.trim() || "Location TBD"}</span>
            </p>
            {travelLine ? (
              <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">{travelLine}</p>
            ) : null}
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              {b.date ?? "—"} {b.time ?? ""}
            </p>
            <CleanerJobEarningsRow
              className="mt-3"
              service={b.service ?? "Cleaning"}
              earningsZar={displayEarningsZar}
              earningsIsEstimate={displayEarningsIsEstimate}
              showServiceColumn={false}
              durationHours={offerDurationHours}
              isTeamJob={b.is_team_job === true}
              teamMemberCount={teamMemberCount}
            />
            {secLeft > 0 ? (
              <p
                className={cn(
                  "mt-2 text-xs font-medium",
                  urgencyTier === "critical" && "animate-pulse text-red-600 dark:text-red-400",
                  urgencyTier === "high" && "text-amber-600 dark:text-amber-500",
                  urgencyTier === "normal" && "text-zinc-500 dark:text-zinc-400",
                )}
              >
                Expires in {formatMmSs(secLeft)} — accept now to secure this job
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                This offer has expired — new jobs coming soon
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              className="h-auto min-h-12 rounded-xl px-2 py-2 text-base font-bold shadow-sm"
              disabled={mutatingThisOffer || secLeft <= 0 || displayEarningsCents == null}
              onClick={() => void handleAccept()}
            >
              {mutatingThisOffer ? (
                <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Accepting" />
              ) : (
                <div className="flex flex-col items-center justify-center gap-0.5 leading-tight">
                  <span>{cleanerOfferAcceptCta(ux)}</span>
                  {displayEarningsZar != null ? (
                    <span className="text-xs font-semibold opacity-80">
                      Earn R{displayEarningsZar.toLocaleString("en-ZA")}
                    </span>
                  ) : null}
                </div>
              )}
            </Button>
            <Button
              variant="outline"
              size="lg"
              className="h-12 rounded-xl border-zinc-300 text-base dark:border-zinc-600"
              disabled={mutatingThisOffer}
              onClick={() => void onDecline(offer.id)}
            >
              Decline
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
