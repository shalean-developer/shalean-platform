export type SeoScrollPctRow = {
  slug: string;
  pct_to_100?: number | null;
  pct_read_to_100?: number | null;
};

export type SeoMomentumMover = {
  slug: string;
  /** Sort key — larger = more movement to surface. */
  momentum: number;
  healthDelta: number | null;
  bookingsDelta: number;
  scrollPointsDelta: number | null;
  /** Short human line, e.g. "Health +6 · Bookings +2 · Scroll +3 pts". */
  signalLine: string;
};

/** Enriched mover for admin cards (human label + hub link). */
export type SeoMomentumMoverRow = SeoMomentumMover & {
  label: string;
  hubHref: string;
};

/**
 * Minimum combined |Δ| score (see `computeSeoMomentumMovers`) required before a hub can appear
 * as a riser or faller. Suppresses tiny period noise from low-volume suburbs.
 */
export const MIN_MOMENTUM_FOR_DIRECTIONAL = 6;

/**
 * Signed “good direction” score for risers vs fallers (health + bookings proxy + scroll completion).
 * Missing health delta is treated as 0 for direction only.
 */
export function signedTrajectoryScore(m: SeoMomentumMover): number {
  const h = m.healthDelta ?? 0;
  const b = m.bookingsDelta;
  const s = m.scrollPointsDelta ?? 0;
  return h * 1.2 + b * 3 + s * 1.5;
}

/** Top improving vs deteriorating hubs by signed trajectory (not by |momentum| alone). */
export function partitionSeoMomentumRisersFallers(
  movers: SeoMomentumMover[],
  eachLimit = 5,
  minMomentum: number = MIN_MOMENTUM_FOR_DIRECTIONAL,
): { risers: SeoMomentumMover[]; fallers: SeoMomentumMover[] } {
  const qualifying = minMomentum <= 0 ? movers : movers.filter((m) => m.momentum >= minMomentum);
  const risers = [...qualifying]
    .filter((m) => signedTrajectoryScore(m) > 0)
    .sort((a, b) => signedTrajectoryScore(b) - signedTrajectoryScore(a))
    .slice(0, eachLimit);
  const fallers = [...qualifying]
    .filter((m) => signedTrajectoryScore(m) < 0)
    .sort((a, b) => signedTrajectoryScore(a) - signedTrajectoryScore(b))
    .slice(0, eachLimit);
  return { risers, fallers };
}

function scrollPct(row: SeoScrollPctRow | undefined): number | null {
  if (!row) return null;
  const v = row.pct_to_100 ?? row.pct_read_to_100;
  if (v == null || Number.isNaN(v)) return null;
  return Math.round(v * 10) / 10;
}

function fmtSignedInt(n: number): string {
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : String(n);
}

function fmtSignedPts(n: number): string {
  const r = Math.round(n * 10) / 10;
  if (r === 0) return "0 pts";
  return r > 0 ? `+${r} pts` : `${r} pts`;
}

/**
 * Surfaces location hubs with the strongest comparative movement (current vs prior 30d).
 * Uses health score delta, booking-start proxy delta, and %→100 scroll delta when available.
 */
export function computeSeoMomentumMovers(input: {
  slugs: string[];
  curBook: Map<string, number>;
  prevBook: Map<string, number>;
  curScroll: Map<string, SeoScrollPctRow>;
  prevScroll: Map<string, SeoScrollPctRow>;
  curHealth: Map<string, number>;
  prevHealth: Map<string, number>;
}): SeoMomentumMover[] {
  const { slugs, curBook, prevBook, curScroll, prevScroll, curHealth, prevHealth } = input;

  const rows: SeoMomentumMover[] = [];

  for (const slug of slugs) {
    const b0 = curBook.get(slug) ?? 0;
    const b1 = prevBook.get(slug) ?? 0;
    const bookingsDelta = b0 - b1;

    const h0 = curHealth.get(slug);
    const h1 = prevHealth.get(slug);
    const healthDelta = h0 != null && h1 != null ? h0 - h1 : null;

    const s0 = scrollPct(curScroll.get(slug));
    const s1 = scrollPct(prevScroll.get(slug));
    const scrollPointsDelta = s0 != null && s1 != null ? Math.round((s0 - s1) * 10) / 10 : null;

    const anySignal =
      bookingsDelta !== 0 ||
      (healthDelta != null && healthDelta !== 0) ||
      (scrollPointsDelta != null && scrollPointsDelta !== 0);
    if (!anySignal) continue;

    const momentum =
      Math.abs(bookingsDelta) * 3 +
      (healthDelta != null ? Math.abs(healthDelta) * 1.2 : 0) +
      (scrollPointsDelta != null ? Math.abs(scrollPointsDelta) * 2 : 0);

    const parts: string[] = [];
    if (healthDelta != null && healthDelta !== 0) parts.push(`Health ${fmtSignedInt(healthDelta)}`);
    if (bookingsDelta !== 0) parts.push(`Bookings ${fmtSignedInt(bookingsDelta)}`);
    if (scrollPointsDelta != null && scrollPointsDelta !== 0) {
      parts.push(`Scroll ${fmtSignedPts(scrollPointsDelta)}`);
    }
    const signalLine = parts.length > 0 ? parts.join(" · ") : "Flat";

    rows.push({
      slug,
      momentum,
      healthDelta,
      bookingsDelta,
      scrollPointsDelta,
      signalLine,
    });
  }

  return rows.sort((a, b) => b.momentum - a.momentum);
}
