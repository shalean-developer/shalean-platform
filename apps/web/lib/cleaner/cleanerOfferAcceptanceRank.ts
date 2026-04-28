/**
 * Client-only ranking for dispatch offers (maximize acceptance UX).
 * Does not change APIs or persisted job data.
 */

import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import { minutesUntilJobStartJohannesburg } from "@/lib/cleaner/cleanerUpcomingScheduleJohannesburg";
import { cleanerUxEstimatedPayZar, jobTotalZarFromCleanerBookingLike } from "@/lib/cleaner/cleanerUxEstimatedPayZar";
import { drivingEtaMinutesFromOfferSnapshot } from "@/lib/cleaner/cleanerOfferValue";

export type OfferAcceptanceRankContext = {
  now: Date;
  cleanerCreatedAtIso: string | null | undefined;
};

/** ZAR whole — display cents when present, else UX model (exact or midpoint of est. range). */
export function offerEarningZarForAcceptanceRank(
  offer: CleanerOfferRow,
  cleanerCreatedAtIso: string | null | undefined,
  now: Date,
): number {
  const raw = offer.displayEarningsCents ?? offer.earnings_cents;
  const cents = raw != null && Number.isFinite(Number(raw)) ? Math.max(0, Math.round(Number(raw))) : 0;
  if (cents > 0) return Math.round(cents / 100);
  const b = offer.booking;
  const total = b ? jobTotalZarFromCleanerBookingLike(b) : null;
  const ux = cleanerUxEstimatedPayZar(cleanerCreatedAtIso, total, now);
  if (ux.kind === "exact") return ux.zar;
  return (ux.lowZar + ux.highZar) / 2;
}

function hoursUntilJobStart(offer: CleanerOfferRow, now: Date): number | null {
  const b = offer.booking;
  if (!b?.date) return null;
  const mins = minutesUntilJobStartJohannesburg(String(b.date), String(b.time ?? ""), now);
  return mins == null ? null : mins / 60;
}

function earningsScore(earningZar: number): number {
  return earningZar / 350;
}

function distanceScore(offer: CleanerOfferRow, maxDistance: number): number {
  const d = drivingEtaMinutesFromOfferSnapshot(offer);
  if (d == null || !Number.isFinite(d) || d < 0) return 0.5;
  const denom = Math.max(maxDistance, 1);
  return 1 - d / denom;
}

function urgencyScore(hoursUntil: number | null): number {
  if (hoursUntil == null || !Number.isFinite(hoursUntil)) return 0.5;
  if (hoursUntil <= 0) return 1;
  const h = Math.max(hoursUntil, 1 / 3600);
  return Math.min(1, 1 / h);
}

export function offerAcceptanceCompositeScore(
  offer: CleanerOfferRow,
  ctx: OfferAcceptanceRankContext,
  batch: CleanerOfferRow[],
): number {
  if (batch.length === 0) return 0;
  const earning = offerEarningZarForAcceptanceRank(offer, ctx.cleanerCreatedAtIso, ctx.now);
  const eScore = earningsScore(Math.max(0, earning));
  const etas = batch
    .map((o) => drivingEtaMinutesFromOfferSnapshot(o))
    .filter((m): m is number => m != null && Number.isFinite(m) && m >= 0);
  const maxDistance = etas.length > 0 ? Math.max(...etas) : 1;
  const dScore = distanceScore(offer, maxDistance);
  const uScore = urgencyScore(hoursUntilJobStart(offer, ctx.now));
  return 0.5 * eScore + 0.3 * dScore + 0.2 * uScore;
}

/** Descending by composite score; ties → sooner offer expiry first. */
export function sortCleanerOffersByAcceptanceScore(
  offers: CleanerOfferRow[],
  ctx: OfferAcceptanceRankContext,
): CleanerOfferRow[] {
  const canonical = [...offers];
  const scoreById = new Map<string, number>();
  for (const o of canonical) {
    scoreById.set(o.id, offerAcceptanceCompositeScore(o, ctx, canonical));
  }
  return canonical.sort((a, b) => {
    const d = (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0);
    if (d !== 0) return d;
    const ta = new Date(a.expires_at).getTime();
    const tb = new Date(b.expires_at).getTime();
    return ta - tb;
  });
}
