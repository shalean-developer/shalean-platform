"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, MapPin, Zap } from "lucide-react";
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
import { AvailableJobsEmptyState } from "@/components/cleaner/AvailableJobsEmptyState";

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

export function CleanerOffersPanel({
  offer,
  busy,
  onAccept,
  onDecline,
}: {
  offer: CleanerOfferRow | null | undefined;
  busy: boolean;
  onAccept: (offerId: string, uxVariant?: string | null) => Promise<void>;
  onDecline: (offerId: string) => Promise<void>;
}) {
  const [secLeft, setSecLeft] = useState(0);
  const alertedOfferIdRef = useRef<string | null>(null);
  const ux = useMemo(() => getCleanerOfferUxConfigFromPersisted(offer?.ux_variant), [offer?.ux_variant]);

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

  if (!offer) {
    return (
      <div className="mb-4 space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available Jobs</p>
        <AvailableJobsEmptyState />
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

  const urgencyRing =
    secLeft > 0 && secLeft <= ux.urgencyHighSec
      ? "animate-pulse ring-2 ring-rose-400/80 shadow-lg shadow-rose-900/10 dark:ring-rose-500/50"
      : secLeft > 0 && secLeft <= ux.urgencyMedSec
        ? "ring-2 ring-amber-400/70 shadow-md dark:ring-amber-500/40"
        : "";

  return (
    <div className="mb-4 space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Available Jobs</p>
      <Card
        className={[
          "rounded-2xl border-amber-200 bg-amber-50/90 shadow-sm transition-shadow duration-300 dark:border-amber-900/50 dark:bg-amber-950/35",
          urgencyRing,
        ].join(" ")}
      >
        <CardContent className="space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
          <Badge variant="warning" className="gap-1 font-semibold">
            <Zap className="h-3 w-3" aria-hidden />
            New offer
          </Badge>
          <span
            className={[
              "flex items-center gap-1 rounded-full px-2 py-0.5 font-mono text-xs font-bold tabular-nums",
              secLeft > 0 && secLeft <= ux.urgencyHighSec
                ? "bg-rose-600 text-white dark:bg-rose-700"
                : "bg-amber-200/90 text-amber-950 dark:bg-amber-900/60 dark:text-amber-50",
            ].join(" ")}
            aria-live="polite"
          >
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {secLeft}s
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
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {b.date ?? "—"} {b.time ?? ""}
          </p>
          <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {displayEarningsZar != null
              ? `You will earn R${displayEarningsZar.toLocaleString("en-ZA")}`
              : "Earnings unavailable"}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="lg"
            className="h-12 rounded-xl text-base font-bold shadow-sm"
            disabled={busy || secLeft <= 0 || displayEarningsCents == null}
            onClick={() => void onAccept(offer.id, offer.ux_variant ?? null)}
          >
            {cleanerOfferAcceptCta(ux)}
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="h-12 rounded-xl border-zinc-300 text-base dark:border-zinc-600"
            disabled={busy}
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
