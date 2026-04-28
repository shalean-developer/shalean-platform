"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import { getCleanerOfferUxConfigFromPersisted } from "@/lib/cleaner/cleanerOfferUxVariant";
import { getCleanerAuthHeaders } from "@/lib/cleaner/cleanerClientHeaders";
import { reportDispatchOfferExposed } from "@/lib/cleaner/reportDispatchOfferExposed";
import { suburbFromLocationForOffer } from "@/lib/cleaner/cleanerOfferLocationSuburb";
import { explicitDurationHoursFromBookingSnapshot, formatApproxJobDurationJobLabel } from "@/lib/cleaner/cleanerMobileBookingMap";
import {
  cleanerUxEstimatedPayZar,
  formatCleanerUxEstimatedPayRangeLabel,
  jobTotalZarFromCleanerBookingLike,
} from "@/lib/cleaner/cleanerUxEstimatedPayZar";
import { formatZarFromCents, formatZarWhole } from "@/lib/cleaner/cleanerZarFormat";
import { cn } from "@/lib/utils";

/** Under 1h: `M:SS`; from 1h: `H:MM:SS` (clear for long accept windows). */
function formatOfferCountdown(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  }
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
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

type OfferRowBadge = "best_match" | "good_option" | null;

function offerRowBadge(rankIndex: number, total: number): OfferRowBadge {
  if (rankIndex === 0 && total >= 1) return "best_match";
  if (rankIndex === 1 && total >= 2) return "good_option";
  return null;
}

type OfferCardProps = {
  offer: CleanerOfferRow;
  rankIndex: number;
  total: number;
  /** Only the top-ranked row tracks expiry “missed” toast (legacy behaviour). */
  trackMissedToast: boolean;
  /** Avoid stacking entry pings when several offers load at once. */
  playEntrySound: boolean;
  busy: boolean;
  busyOfferId?: string | null;
  cleanerCreatedAtIso: string | null;
  onAccept: (offerId: string, uxVariant?: string | null) => Promise<boolean>;
  onDecline: (offerId: string) => void | Promise<void>;
  onAcceptSuccess?: (bookingId: string) => void;
  onCelebrate: (bookingId: string) => void;
};

function CleanerOfferCardRow({
  offer,
  rankIndex,
  total,
  trackMissedToast,
  playEntrySound,
  busy,
  busyOfferId,
  cleanerCreatedAtIso,
  onAccept,
  onDecline,
  onAcceptSuccess,
  onCelebrate,
}: OfferCardProps) {
  const [secLeft, setSecLeft] = useState(0);
  const alertedOfferIdRef = useRef<string | null>(null);
  const criticalChimedRef = useRef(false);
  const prevSecRef = useRef<number | null>(null);
  const ux = useMemo(() => getCleanerOfferUxConfigFromPersisted(offer.ux_variant), [offer.ux_variant]);
  const mutatingThisOffer = Boolean(busy && busyOfferId && offer.id && busyOfferId === offer.id);
  const isTop = rankIndex === 0;
  const badge = offerRowBadge(rankIndex, total);

  useEffect(() => {
    if (!trackMissedToast || !offer.id) {
      prevSecRef.current = null;
      return;
    }
    const cents = offer.displayEarningsCents;
    const zar =
      cents != null && Number.isFinite(Number(cents)) ? Math.round(Math.max(0, Number(cents)) / 100) : null;
    const prev = prevSecRef.current;
    prevSecRef.current = secLeft;
    if (prev != null && prev > 0 && secLeft === 0 && zar != null) {
      window.dispatchEvent(new CustomEvent("cleaner-offer-missed", { detail: { zar } }));
    }
  }, [secLeft, offer.id, offer.displayEarningsCents, trackMissedToast]);

  useEffect(() => {
    criticalChimedRef.current = false;
  }, [offer.id]);

  useEffect(() => {
    if (secLeft > 30) {
      criticalChimedRef.current = false;
      return;
    }
    if (!playEntrySound || !ux.sound || !offer.id) return;
    if (secLeft <= 0 || secLeft > 30) return;
    if (criticalChimedRef.current) return;
    criticalChimedRef.current = true;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([20, 40, 24, 40, 20]);
    }
    playOfferCriticalPing();
  }, [secLeft, ux.sound, offer.id, playEntrySound]);

  useEffect(() => {
    void (async () => {
      const headers = await getCleanerAuthHeaders();
      if (headers) reportDispatchOfferExposed(offer.id, headers);
    })();
  }, [offer.id]);

  useEffect(() => {
    if (!playEntrySound) return;
    if (alertedOfferIdRef.current === offer.id) return;
    alertedOfferIdRef.current = offer.id;
    if (!ux.sound) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([16, 36, 20]);
    }
    playOfferPing();
  }, [offer.id, ux.sound, playEntrySound]);

  useEffect(() => {
    if (!offer.expires_at) {
      setSecLeft(0);
      return;
    }
    const tick = () => {
      const end = new Date(offer.expires_at).getTime();
      setSecLeft(Math.max(0, Math.floor((end - Date.now()) / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [offer.expires_at, offer.id]);

  if (!offer.booking || offer.booking.is_team_job === true) return null;
  const b = offer.booking;
  const durationHours = explicitDurationHoursFromBookingSnapshot(b.booking_snapshot);
  const durationJobLine = durationHours != null ? formatApproxJobDurationJobLabel(durationHours) : null;
  const displayEarningsCents =
    offer.displayEarningsCents != null && Number.isFinite(Number(offer.displayEarningsCents))
      ? Math.max(0, Math.round(Number(offer.displayEarningsCents)))
      : null;
  const displayEarningsIsEstimate = offer.displayEarningsIsEstimate === true;
  const offerJobTotalZar = jobTotalZarFromCleanerBookingLike(b);
  const uxPayWhenMissingCents =
    displayEarningsCents == null ? cleanerUxEstimatedPayZar(cleanerCreatedAtIso, offerJobTotalZar) : null;
  const suburb = suburbFromLocationForOffer(b.location).trim() || "Area on file";
  const showYouEarnLine = displayEarningsCents != null || uxPayWhenMissingCents?.kind === "exact";
  const jobHref = `/cleaner/job/${encodeURIComponent(offer.booking_id)}`;

  async function handleAccept(): Promise<void> {
    const ok = await onAccept(offer.id, offer.ux_variant ?? null);
    if (ok) {
      onCelebrate(offer.booking_id);
      onAcceptSuccess?.(offer.booking_id);
    }
  }

  return (
    <Card
      className={cn(
        "rounded-2xl border border-zinc-200/90 bg-white shadow-sm dark:border-zinc-700 dark:bg-zinc-900",
        isTop && "border-emerald-400/75 shadow-md dark:border-emerald-600/45",
      )}
    >
      <CardContent className={cn("pt-3", isTop ? "p-5" : "p-4")}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-h-[28px] min-w-0 flex-1">
            {badge === "best_match" ? (
              <span className="inline-flex rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:bg-blue-950/60 dark:text-blue-100">
                Best match
              </span>
            ) : badge === "good_option" ? (
              <span className="inline-flex rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-semibold text-sky-900 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
                Good option
              </span>
            ) : (
              <span className="block min-h-[28px]" aria-hidden />
            )}
          </div>
          <span
            className={cn(
              "shrink-0 tabular-nums text-xs font-medium text-zinc-500 dark:text-zinc-400",
              secLeft > 0 && secLeft <= 30 && "font-semibold text-rose-600 dark:text-rose-400",
            )}
            aria-live="polite"
          >
            ⏱ {formatOfferCountdown(secLeft)}
          </span>
        </div>

        <div className={cn("mt-5 space-y-1.5", isTop && "mt-6")}>
          {displayEarningsCents != null ? (
            <p
              className={cn(
                "font-bold tabular-nums leading-tight text-green-600 dark:text-green-400",
                isTop ? "text-3xl" : "text-2xl",
              )}
            >
              {formatZarFromCents(displayEarningsCents)}
              {displayEarningsIsEstimate ? (
                <span className="ml-1.5 text-sm font-semibold text-zinc-500 dark:text-zinc-400">(est.)</span>
              ) : null}
            </p>
          ) : uxPayWhenMissingCents?.kind === "exact" ? (
            <p
              className={cn(
                "font-bold tabular-nums leading-tight text-green-600 dark:text-green-400",
                isTop ? "text-3xl" : "text-2xl",
              )}
            >
              {formatZarWhole(uxPayWhenMissingCents.zar)}
            </p>
          ) : (
            <p
              className={cn(
                "font-bold tabular-nums leading-tight text-green-600 dark:text-green-400",
                isTop ? "text-3xl" : "text-2xl",
              )}
            >
              {formatCleanerUxEstimatedPayRangeLabel()}
            </p>
          )}

          {showYouEarnLine ? (
            <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">You earn</p>
          ) : null}

          {durationJobLine ? (
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{durationJobLine}</p>
          ) : null}

          <p className="pt-0.5 text-base font-semibold text-zinc-900 dark:text-zinc-50">{suburb}</p>

          <p className="text-xs text-zinc-500 dark:text-zinc-400">Paid after completion</p>
        </div>

        {secLeft <= 0 ? (
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">This offer has expired.</p>
        ) : null}

        <div className="mt-5 space-y-2">
          {isTop ? (
            <>
              <Button
                className="h-12 w-full rounded-xl bg-blue-600 text-base font-semibold text-white hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500"
                disabled={mutatingThisOffer || secLeft <= 0}
                onClick={() => void handleAccept()}
              >
                {mutatingThisOffer ? (
                  <Loader2 className="mx-auto h-6 w-6 animate-spin" aria-label="Accepting" />
                ) : (
                  "Accept job"
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-12 w-full rounded-xl border-zinc-300 text-base font-medium text-zinc-700 dark:border-zinc-600 dark:text-zinc-200"
                disabled={mutatingThisOffer}
                onClick={() => void onDecline(offer.id)}
              >
                Decline
              </Button>
            </>
          ) : (
            <>
              {secLeft > 0 ? (
                <Button
                  className="h-12 w-full rounded-xl border-2 border-blue-200 bg-white text-base font-semibold text-blue-800 hover:bg-blue-50 dark:border-blue-800 dark:bg-zinc-900 dark:text-blue-100 dark:hover:bg-blue-950/40"
                  asChild
                >
                  <Link href={jobHref}>View job</Link>
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled
                  className="h-12 w-full rounded-xl border-2 border-zinc-200 bg-zinc-100 text-base font-semibold text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                >
                  View job
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-10 w-full text-sm font-medium text-zinc-600 dark:text-zinc-400"
                disabled={mutatingThisOffer}
                onClick={() => void onDecline(offer.id)}
              >
                Decline
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export function CleanerOffersPanel({
  rankedSoloOffers,
  busy,
  busyOfferId,
  cleanerCreatedAtIso = null,
  moreJobsTodayCount = 0,
  onAccept,
  onDecline,
  onAcceptSuccess,
  hideSectionHeading = false,
}: {
  /** Client-ranked dispatch offers (solo). */
  rankedSoloOffers: CleanerOfferRow[];
  busy: boolean;
  busyOfferId?: string | null;
  cleanerCreatedAtIso?: string | null;
  moreJobsTodayCount?: number;
  onAccept: (offerId: string, uxVariant?: string | null) => Promise<boolean>;
  onDecline: (offerId: string) => void | Promise<void>;
  onAcceptSuccess?: (bookingId: string) => void;
  hideSectionHeading?: boolean;
}) {
  const [celebrateBookingId, setCelebrateBookingId] = useState<string | null>(null);
  const [missedZar, setMissedZar] = useState<number | null>(null);

  const solo = useMemo(
    () => rankedSoloOffers.filter((o) => o.booking != null && o.booking.is_team_job !== true),
    [rankedSoloOffers],
  );

  useEffect(() => {
    const onMissed = (e: Event) => {
      const ce = e as CustomEvent<{ zar: number }>;
      const z = ce.detail?.zar;
      if (typeof z !== "number" || !Number.isFinite(z)) return;
      setMissedZar(z);
      window.setTimeout(() => setMissedZar(null), 2000);
    };
    window.addEventListener("cleaner-offer-missed", onMissed as EventListener);
    return () => window.removeEventListener("cleaner-offer-missed", onMissed as EventListener);
  }, []);

  useEffect(() => {
    if (!celebrateBookingId) return;
    const t = window.setTimeout(() => setCelebrateBookingId(null), 2200);
    return () => clearTimeout(t);
  }, [celebrateBookingId]);

  if (celebrateBookingId) {
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

  if (solo.length === 0) {
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

  return (
    <div className={cn("space-y-3", hideSectionHeading ? "mb-0" : "mb-4")}>
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
        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">{moreJobsTodayCount} more today</p>
      ) : null}
      {solo.map((offer, rankIndex) => (
        <CleanerOfferCardRow
          key={offer.id}
          offer={offer}
          rankIndex={rankIndex}
          total={solo.length}
          trackMissedToast={rankIndex === 0}
          playEntrySound={rankIndex === 0}
          busy={busy}
          busyOfferId={busyOfferId}
          cleanerCreatedAtIso={cleanerCreatedAtIso}
          onAccept={onAccept}
          onDecline={onDecline}
          onAcceptSuccess={onAcceptSuccess}
          onCelebrate={setCelebrateBookingId}
        />
      ))}
    </div>
  );
}
