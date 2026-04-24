import { CLEANER_UX_VARIANTS, type CleanerUxVariant } from "@/lib/cleaner/cleanerOfferUxVariant";

export type DispatchExperimentConfidence = "low" | "medium" | "high";

export type DispatchExperimentAnalysis = {
  summary: string | null;
  /** Raw best cell by accept rate (may be low-confidence); use {@link starWorthyBestUxVariant} for UI stars. */
  bestUxVariant: CleanerUxVariant | "unknown" | null;
  /** Best variant to highlight when confidence is not low and there is a clear winner. */
  starWorthyBestUxVariant: CleanerUxVariant | "unknown" | null;
  confidence: DispatchExperimentConfidence | null;
  noClearWinner: boolean;
  /** Resolved-offer count in the rolling window (used for confidence tiers and n= in copy). */
  resolvedOfferCount: number | null;
};

export type OfferLike = {
  status?: string | null;
  created_at?: string | null;
  responded_at?: string | null;
  ux_variant?: string | null;
  booking_id?: string | null;
};

function variantKey(o: OfferLike): CleanerUxVariant | "unknown" {
  const u = String(o.ux_variant ?? "").trim().toLowerCase();
  if ((CLEANER_UX_VARIANTS as readonly string[]).includes(u)) return u as CleanerUxVariant;
  return "unknown";
}

function acceptLatencyMs(o: OfferLike): number | null {
  const c = new Date(String(o.created_at ?? "")).getTime();
  const r = new Date(String(o.responded_at ?? "")).getTime();
  if (!Number.isFinite(c) || !Number.isFinite(r) || r < c) return null;
  return r - c;
}

function p95Ms(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const idx = Math.max(0, Math.floor(0.95 * (s.length - 1)));
  return s[idx] ?? 0;
}

function confidenceFromResolvedCount(n: number): DispatchExperimentConfidence {
  if (n < 200) return "low";
  if (n <= 1000) return "medium";
  return "high";
}

function rollingLabel(days: number): string {
  return `last ${days} days (rolling)`;
}

function confidenceWithN(conf: DispatchExperimentConfidence, n: number): string {
  return `${conf} confidence (n=${n} resolved offers)`;
}

/** Mean dispatch offers per booking (any status) in the window for a UX cell. */
function meanOffersPerBooking(recent: OfferLike[], v: CleanerUxVariant): number | null {
  const rows = recent.filter((o) => o.booking_id && variantKey(o) === v);
  if (rows.length === 0) return null;
  const bookings = new Set(rows.map((o) => String(o.booking_id)));
  if (bookings.size === 0) return null;
  return rows.length / bookings.size;
}

type Agg = { resolved: number; accepted: number; latencies: number[] };

function starWorthy(
  best: CleanerUxVariant | "unknown" | null,
  confidence: DispatchExperimentConfidence | null,
  noClearWinner: boolean,
): CleanerUxVariant | "unknown" | null {
  if (!best || !confidence || noClearWinner) return null;
  if (confidence === "low") return null;
  return best;
}

/**
 * Structured experiment readout from `dispatch_offers` (same window as `/api/admin/analytics`).
 * Adds confidence (sample depth), no-winner when accept rates cluster, offers/booking guardrail vs control,
 * and {@link starWorthyBestUxVariant} for UI that must not over-signal on thin data.
 */
export function analyzeDispatchExperimentFromOffers(
  offers: OfferLike[],
  opts?: {
    days?: number;
    minResolvedPerVariant?: number;
    minTotalResolved?: number;
    acceptRateNoisePp?: number;
    offersPerBookingGuardrailPct?: number;
  },
): DispatchExperimentAnalysis {
  const empty: DispatchExperimentAnalysis = {
    summary: null,
    bestUxVariant: null,
    starWorthyBestUxVariant: null,
    confidence: null,
    noClearWinner: false,
    resolvedOfferCount: null,
  };

  const days = opts?.days ?? 7;
  const minPer = opts?.minResolvedPerVariant ?? 5;
  const minTotal = opts?.minTotalResolved ?? 20;
  const noisePp = opts?.acceptRateNoisePp ?? 2;
  const opbGuardPct = opts?.offersPerBookingGuardrailPct ?? 8;
  const roll = rollingLabel(days);

  const cutoff = Date.now() - days * 86_400_000;
  const recent = offers.filter((o) => {
    const t = new Date(String(o.created_at ?? "")).getTime();
    return Number.isFinite(t) && t >= cutoff;
  });
  if (recent.length === 0) return empty;

  const resolved = recent.filter((o) => {
    const st = String(o.status ?? "").toLowerCase();
    return st === "accepted" || st === "rejected" || st === "expired";
  });
  if (resolved.length < minTotal) return empty;

  const confidence = confidenceFromResolvedCount(resolved.length);
  const nResolved = resolved.length;

  const by = new Map<CleanerUxVariant | "unknown", Agg>();
  for (const v of [...CLEANER_UX_VARIANTS, "unknown" as const]) {
    by.set(v, { resolved: 0, accepted: 0, latencies: [] });
  }

  for (const o of resolved) {
    const k = variantKey(o);
    const g = by.get(k)!;
    g.resolved++;
    if (String(o.status ?? "").toLowerCase() === "accepted") {
      g.accepted++;
      const ms = acceptLatencyMs(o);
      if (ms != null) g.latencies.push(ms);
    }
  }

  type Eligible = { k: CleanerUxVariant; rate: number; agg: Agg };
  const eligible: Eligible[] = [];
  for (const k of CLEANER_UX_VARIANTS) {
    const g = by.get(k)!;
    if (g.resolved < minPer) continue;
    eligible.push({ k, rate: g.accepted / g.resolved, agg: g });
  }
  eligible.sort((a, b) => b.rate - a.rate);

  const noise = noisePp / 100;
  const noClearWinner =
    eligible.length >= 2 && eligible[0]!.rate - eligible[1]!.rate < noise;

  if (noClearWinner) {
    return {
      summary: `No clear winner (accept rates within ~${noisePp}pp among variants with enough volume, ${confidenceWithN(confidence, nResolved)}) — ${roll}`,
      bestUxVariant: null,
      starWorthyBestUxVariant: null,
      confidence,
      noClearWinner: true,
      resolvedOfferCount: nResolved,
    };
  }

  let best: { k: CleanerUxVariant | "unknown"; rate: number; agg: Agg } | null = null;
  if (eligible.length >= 1) {
    const top = eligible[0]!;
    best = { k: top.k, rate: top.rate, agg: top.agg };
  } else {
    const unk = by.get("unknown")!;
    if (unk.resolved >= minPer) {
      best = { k: "unknown", rate: unk.accepted / unk.resolved, agg: unk };
    }
  }
  if (!best) return empty;

  const ctrl = by.get("control")!;
  const ctrlRate = ctrl.resolved >= minPer ? ctrl.accepted / ctrl.resolved : null;
  const ctrlP95 = ctrl.latencies.length >= 3 ? p95Ms(ctrl.latencies) : 0;
  const bestP95 = best.agg.latencies.length >= 3 ? p95Ms(best.agg.latencies) : 0;

  const ratePct = Math.round(best.rate * 1000) / 10;

  if (best.k === "control") {
    return {
      summary: `control is baseline (${ratePct}% accept rate, ${confidenceWithN(confidence, nResolved)}) — ${roll}`,
      bestUxVariant: "control",
      starWorthyBestUxVariant: starWorthy("control", confidence, false),
      confidence,
      noClearWinner: false,
      resolvedOfferCount: nResolved,
    };
  }

  if (best.k === "unknown") {
    return {
      summary: `unknown is best (${ratePct}% accept rate, ${confidenceWithN(confidence, nResolved)}) — ${roll}`,
      bestUxVariant: "unknown",
      starWorthyBestUxVariant: starWorthy("unknown", confidence, false),
      confidence,
      noClearWinner: false,
      resolvedOfferCount: nResolved,
    };
  }

  const parts: string[] = [];

  if (ctrlRate != null) {
    const pp = Math.round((best.rate - ctrlRate) * 1000) / 10;
    const sign = pp >= 0 ? "+" : "";
    parts.push(`${sign}${pp}pp accept rate vs control`);
  } else {
    parts.push(`${ratePct}% accept rate (cell)`);
  }

  if (ctrlP95 > 0 && bestP95 > 0 && best.agg.latencies.length >= 3) {
    const latPct = Math.round(((bestP95 - ctrlP95) / ctrlP95) * 1000) / 10;
    const latSign = latPct <= 0 ? "" : "+";
    parts.push(`${latSign}${latPct}% p95 vs control`);
  }

  const opbBest = meanOffersPerBooking(recent, best.k);
  const opbCtrl = meanOffersPerBooking(recent, "control");
  if (opbBest != null && opbCtrl != null && opbCtrl > 0) {
    const relPct = Math.round(((opbBest - opbCtrl) / opbCtrl) * 1000) / 10;
    if (relPct >= opbGuardPct) {
      parts.push(`+${relPct}% offers per booking vs control ⚠️`);
    }
  }

  parts.push(confidenceWithN(confidence, nResolved));

  const summary = `${best.k} is best (${parts.join(", ")}) — ${roll}`;

  return {
    summary,
    bestUxVariant: best.k,
    starWorthyBestUxVariant: starWorthy(best.k, confidence, false),
    confidence,
    noClearWinner: false,
    resolvedOfferCount: nResolved,
  };
}

export function buildDispatchExperimentSummary(
  offers: OfferLike[],
  opts?: { days?: number; minResolvedPerVariant?: number; minTotalResolved?: number },
): string | null {
  return analyzeDispatchExperimentFromOffers(offers, opts).summary;
}
