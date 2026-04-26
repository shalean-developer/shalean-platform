/**
 * Cleaner offer ordering (this module)
 *
 * - **Client-side sort** is a presentation/ranking hint for one cleaner’s pending queue only.
 * - **Idle × offer-age** multipliers do not allocate work across cleaners; they nudge ordering
 *   (idle scales all offers equally; age differentiates similar-value rows).
 * - **Fair dispatch across cleaners** belongs on the server (assignment, caps, rotation, SLA).
 */
import type { CleanerOfferRow } from "@/lib/cleaner/cleanerOfferRow";
import { durationHoursFromBookingSnapshot } from "@/lib/cleaner/cleanerMobileBookingMap";

/** Pay per booked hour (cents/h) — higher = better value for the cleaner. */
export function offerValueScoreCentsPerHour(offer: CleanerOfferRow): number {
  const raw = offer.displayEarningsCents;
  const cents =
    raw != null && Number.isFinite(Number(raw)) ? Math.max(0, Math.round(Number(raw))) : 0;
  const snap = offer.booking?.booking_snapshot ?? null;
  const h = durationHoursFromBookingSnapshot(snap);
  const hours = h > 0 && Number.isFinite(h) ? h : 1;
  return cents / hours;
}

/** Minutes since `created_at` (dispatch offer row). */
export function offerAgeMinutes(offer: CleanerOfferRow, now: Date): number {
  const t = new Date(offer.created_at).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (now.getTime() - t) / 60000);
}

/**
 * Cleaner idle factor (same for all offers in one session). Caps at 240m.
 * Multiplier is uniform across a cleaner’s queue but matches product spec for analytics / future server parity.
 */
export function fairnessBoostIdle(idleMinutesSinceLastCompleted: number): number {
  return 1 + Math.min(Math.max(0, idleMinutesSinceLastCompleted), 240) / 120;
}

/** Waiting-offer boost: older pending offers gain priority among similar pay/hour (caps at 240m age). */
export function fairnessBoostOfferAge(offer: CleanerOfferRow, now: Date): number {
  return 1 + Math.min(offerAgeMinutes(offer, now), 240) / 120;
}

export type OfferSortContext = {
  now: Date;
  /** From last completed job `completed_at` (or large default if none). */
  idleMinutesSinceLastCompleted: number;
};

/**
 * `value * idleBoost * ageBoost` — age term differentiates offers for one cleaner; idle scales all equally
 * (keeps spec; relative order is driven mainly by value × offer age).
 * @see dispatchCompositeScore — primary sort uses composite (value/distance/urgency) × these boosts.
 */
export function adjustedOfferValueScore(offer: CleanerOfferRow, ctx: OfferSortContext): number {
  const base = offerValueScoreCentsPerHour(offer);
  return base * fairnessBoostIdle(ctx.idleMinutesSinceLastCompleted) * fairnessBoostOfferAge(offer, ctx.now);
}

function offerSecLeftSeconds(offer: CleanerOfferRow, now: Date): number {
  const t = new Date(offer.expires_at).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, (t - now.getTime()) / 1000);
}

/** Higher = sooner deadline (more urgent). */
function urgencySignalRaw(offer: CleanerOfferRow, now: Date): number {
  const s = offerSecLeftSeconds(offer, now);
  return 1 / (1 + s / 90);
}

/** Higher = shorter drive when ETA known. */
function driveClosenessRaw(etaMinutes: number | null): number | null {
  if (etaMinutes == null || !Number.isFinite(etaMinutes) || etaMinutes <= 0) return null;
  return 1 / (1 + etaMinutes / 25);
}

function medianFinite(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor((s.length - 1) / 2)]!;
}

/** Min–max to [0,1], higher raw → higher norm. Single distinct value → 1 for max row. */
function normalizeHigherBetter(raw: number[]): number[] {
  if (raw.length === 0) return [];
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi === lo) {
    return raw.map(() => 1);
  }
  return raw.map((v) => (v - lo) / (hi - lo));
}

/**
 * Weighted blend (not shown in UI): value vs drive proximity vs expiry urgency,
 * then multiplied by idle + offer-age fairness boosts.
 */
export function dispatchCompositeScore(offer: CleanerOfferRow, ctx: OfferSortContext, batch: CleanerOfferRow[]): number {
  if (batch.length === 0) return 0;
  const valueRaw = batch.map((o) => offerValueScoreCentsPerHour(o));
  const valueNorm = normalizeHigherBetter(valueRaw);

  const closenessFilled = batch.map((o) => {
    const c = driveClosenessRaw(drivingEtaMinutesFromOfferSnapshot(o));
    return c;
  });
  const definedCloseness = closenessFilled.filter((c): c is number => c != null);
  const fill = medianFinite(definedCloseness) ?? 0.45;
  const closenessForNorm = closenessFilled.map((c) => c ?? fill);
  const distNorm = normalizeHigherBetter(closenessForNorm);

  const urgRaw = batch.map((o) => urgencySignalRaw(o, ctx.now));
  const urgNorm = normalizeHigherBetter(urgRaw);

  const idx = batch.findIndex((o) => o.id === offer.id);
  const i = idx >= 0 ? idx : 0;
  const vN = valueNorm[i] ?? 0.5;
  const dN = distNorm[i] ?? 0.5;
  const uN = urgNorm[i] ?? 0.5;
  const composite = 0.6 * vN + 0.25 * dN + 0.15 * uN;
  return (
    composite *
    fairnessBoostIdle(ctx.idleMinutesSinceLastCompleted) *
    fairnessBoostOfferAge(offer, ctx.now)
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * When snapshots include `flat.drive_eta_minutes` (or legacy aliases), surface a travel line.
 * Returns null until the pipeline writes ETA.
 */
export function drivingEtaMinutesFromOfferSnapshot(offer: CleanerOfferRow): number | null {
  const snap = offer.booking?.booking_snapshot;
  if (!isRecord(snap)) return null;
  const flat = snap.flat;
  if (!isRecord(flat)) return null;
  const keys = ["drive_eta_minutes", "driveTimeMinutes", "eta_minutes", "travel_minutes"] as const;
  for (const k of keys) {
    const v = flat[k];
    if (typeof v === "number" && Number.isFinite(v) && v > 0) return Math.round(v);
    if (typeof v === "string" && /^\d+$/.test(v.trim())) {
      const n = parseInt(v, 10);
      if (n > 0) return n;
    }
  }
  return null;
}

export function formatOfferTravelHintMinutes(minutes: number | null): string | null {
  if (minutes == null || !Number.isFinite(minutes) || minutes <= 0) return null;
  const m = Math.round(minutes);
  if (m < 60) return `${m} min away`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}h ${r}m away` : `${h}h away`;
}

/** Richer one-liner when ETA exists; combines drive + urgency when slot is soon. */
export function formatOfferTravelDecisionHint(etaMinutes: number | null, secLeft: number): string | null {
  const core = formatOfferTravelHintMinutes(etaMinutes);
  if (!core) return null;
  const m = etaMinutes != null && Number.isFinite(etaMinutes) ? Math.round(etaMinutes) : 999;
  const expiringSoon = secLeft > 0 && secLeft <= 120;
  const shortDrive = m <= 12;
  const close = m <= 15;
  if (shortDrive && expiringSoon) {
    return `🚗 ${m} min away • starting soon`;
  }
  if (close && expiringSoon) {
    return `🚗 ${core} • starting soon`;
  }
  if (close) {
    return `🚗 ${core} • starts soon`;
  }
  return `🚗 ${core}`;
}

/** Median of positive value scores (cents/h) for “above typical” checks. */
export function medianOfferValueScore(offers: CleanerOfferRow[]): number {
  const s = offers.map(offerValueScoreCentsPerHour).filter((x) => x > 0).sort((a, b) => a - b);
  if (s.length === 0) return 0;
  return s[Math.floor((s.length - 1) / 2)]!;
}

/** Best dispatch composite (value/distance/urgency × fairness boosts) first; ties → sooner expiry. */
export function sortCleanerOffersByAdjustedValue(offers: CleanerOfferRow[], ctx: OfferSortContext): CleanerOfferRow[] {
  const canonical = [...offers];
  const scoreById = new Map<string, number>();
  for (const o of canonical) {
    scoreById.set(o.id, dispatchCompositeScore(o, ctx, canonical));
  }
  return canonical.sort((a, b) => {
    const d = (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0);
    if (d !== 0) return d;
    const ta = new Date(a.expires_at).getTime();
    const tb = new Date(b.expires_at).getTime();
    return ta - tb;
  });
}
