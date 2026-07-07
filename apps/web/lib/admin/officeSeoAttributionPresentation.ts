import { rowsToCsv } from "@/lib/admin/csvExport";
import { landingDisplayName } from "@/lib/admin/landingPageAttribution";

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

export type SeoAttributionDayRow = {
  date: string;
  starts: number;
  completed: number;
};

export type SeoAttributionTrendPoint = SeoAttributionDayRow & {
  label: string;
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

function formatTrendDayLabel(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString("en-ZA", { month: "short", day: "numeric", timeZone: "UTC" });
}

/**
 * Trim leading/trailing empty days from the daily series and attach a short display label.
 * The API pads the full 30-day window with zeros; showing all of it drowns out real activity.
 */
export function buildAttributionTrendSeries(
  byDay: SeoAttributionDayRow[] | undefined,
): SeoAttributionTrendPoint[] {
  const rows = byDay ?? [];
  let start = 0;
  let end = rows.length - 1;
  while (start <= end && rows[start].starts === 0 && rows[start].completed === 0) start += 1;
  while (end >= start && rows[end].starts === 0 && rows[end].completed === 0) end -= 1;
  if (start > end) return [];
  return rows.slice(start, end + 1).map((r) => ({ ...r, label: formatTrendDayLabel(r.date) }));
}

/** CSV export of the landing-page performance table (all rows, not just the current page). */
export function buildSeoAttributionLandingCsv(rows: SeoAttributionLandingRow[]): string {
  const data = rows.map((r) => ({
    page: landingDisplayName(r.landing),
    path: r.landing,
    sessions: r.sessions,
    starts: r.quoted,
    completions: r.completed,
    cvr_pct: r.conversionPct,
  }));
  return rowsToCsv(["page", "path", "sessions", "starts", "completions", "cvr_pct"], data);
}
