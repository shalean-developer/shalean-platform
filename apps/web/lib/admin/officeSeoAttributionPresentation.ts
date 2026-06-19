export type SeoAttributionSourceRow = {
  source: string;
  medium: string;
  key: string;
  quoted: number;
  completed: number;
  conversionPct: number;
};

export type SeoAttributionLandingRow = {
  landing: string;
  sessions: number;
  quoted: number;
  completed: number;
  conversionPct: number;
};

export type SeoAttributionServiceRow = {
  service: string;
  quoted: number;
  completed: number;
  conversionPct: number;
};

export type SeoAttributionChannelBar = {
  label: string;
  bookings: number;
  starts: number;
  pct: number;
};

export function seoAttributionChannelLabel(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("organic")) return "Organic SEO";
  if (s.includes("google") || s.includes("gbp:")) return "Google Ads";
  if (s.includes("facebook") || s.includes("fb")) return "Facebook Ads";
  if (s.includes("referral")) return "Referrals";
  return source;
}

export function findOrganicAttributionRow(
  bySource: SeoAttributionSourceRow[] | undefined,
): SeoAttributionSourceRow | null {
  return bySource?.find((s) => s.source.toLowerCase().includes("organic")) ?? null;
}

/** Roll up UTM rows into stable channel labels (avoids duplicate React keys and split bars). */
export function buildAttributionChannelBars(bySource: SeoAttributionSourceRow[]): SeoAttributionChannelBar[] {
  const byLabel = new Map<string, { bookings: number; starts: number }>();
  for (const row of bySource) {
    const label = seoAttributionChannelLabel(row.source);
    const cur = byLabel.get(label) ?? { bookings: 0, starts: 0 };
    cur.bookings += row.completed;
    cur.starts += row.quoted;
    byLabel.set(label, cur);
  }

  const totalBookings = [...byLabel.values()].reduce((sum, row) => sum + row.bookings, 0) || 1;
  return [...byLabel.entries()]
    .map(([label, stats]) => ({
      label,
      bookings: stats.bookings,
      starts: stats.starts,
      pct: Math.round((stats.bookings / totalBookings) * 100),
    }))
    .sort((a, b) => b.bookings - a.bookings || b.starts - a.starts)
    .slice(0, 8);
}

export function formatAttributionSince(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toLocaleDateString("en-ZA", { month: "short", day: "numeric", year: "numeric" });
}
