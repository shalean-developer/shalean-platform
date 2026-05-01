import type { BookingLocationRecord } from "@/lib/locations/seoBookingLocations";
import { BOOKING_LOCATION_CATALOG, REGION_SECTION_ORDER } from "@/lib/locations/seoBookingLocations";

function norm(s: string): string {
  return s.trim().toLowerCase();
}

/** Instant filter (debounce applied by caller on the query string). */
export function filterBookingLocations(query: string, catalog: BookingLocationRecord[] = BOOKING_LOCATION_CATALOG): BookingLocationRecord[] {
  const q = norm(query);
  if (!q) return [...catalog];
  return catalog.filter((loc) => {
    const hay = `${loc.label} ${loc.slug} ${loc.region} ${loc.regionDisplay} ${loc.city}`.toLowerCase();
    return hay.includes(q);
  });
}

export type GroupedBookingLocations = { regionDisplay: string; items: BookingLocationRecord[] };

function regionRank(display: string): number {
  const i = REGION_SECTION_ORDER.indexOf(display);
  return i >= 0 ? i : 999;
}

export function groupBookingLocations(rows: BookingLocationRecord[]): GroupedBookingLocations[] {
  const map = new Map<string, BookingLocationRecord[]>();
  for (const loc of rows) {
    const list = map.get(loc.regionDisplay) ?? [];
    list.push(loc);
    map.set(loc.regionDisplay, list);
  }
  for (const list of map.values()) {
    list.sort((a, b) => a.label.localeCompare(b.label, "en-ZA"));
  }
  return [...map.entries()]
    .map(([regionDisplay, items]) => ({ regionDisplay, items }))
    .sort((a, b) => {
      const dr = regionRank(a.regionDisplay) - regionRank(b.regionDisplay);
      if (dr !== 0) return dr;
      return a.regionDisplay.localeCompare(b.regionDisplay, "en-ZA");
    });
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost);
    }
  }
  return dp[m]![n]!;
}

/** When strict filter returns nothing, suggest closest labels by edit distance. */
export function fuzzyBookingLocationSuggestions(
  query: string,
  limit = 5,
  catalog: BookingLocationRecord[] = BOOKING_LOCATION_CATALOG,
): BookingLocationRecord[] {
  const q = norm(query);
  if (!q) return [];
  const scored = catalog.map((loc) => {
    const dLabel = levenshtein(q, norm(loc.label));
    const dSlug = levenshtein(q, loc.slug.replace(/-/g, ""));
    const score = Math.min(dLabel, dSlug);
    return { loc, score };
  });
  scored.sort((a, b) => a.score - b.score || a.loc.label.localeCompare(b.loc.label, "en-ZA"));
  const out: BookingLocationRecord[] = [];
  const seen = new Set<string>();
  for (const { loc } of scored) {
    if (seen.has(loc.slug)) continue;
    seen.add(loc.slug);
    out.push(loc);
    if (out.length >= limit) break;
  }
  return out;
}

export function flattenGrouped(groups: GroupedBookingLocations[]): BookingLocationRecord[] {
  const out: BookingLocationRecord[] = [];
  for (const g of groups) {
    out.push(...g.items);
  }
  return out;
}
