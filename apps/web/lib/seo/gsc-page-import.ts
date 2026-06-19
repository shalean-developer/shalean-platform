/**
 * Parse Search Console page exports / URLs into hub slug rows for `LOCATION_SEO_FEEDBACK_JSON`.
 */

import type { GscLocationMetaRow } from "@/lib/seo/gsc-location-meta-merge";
import type { LocationSeoFeedbackConfig } from "@/lib/seo/location-seo-feedback.types";
import { getAllProgrammaticLocationSlugs } from "@/lib/seo/locations";
import { CAPE_TOWN_LOCATIONS } from "@/lib/seo/capeTownLocations";

const HUB_SUFFIX = "-cleaning-services";

/** Extract hub slug from a GSC page URL or path, e.g. `/locations/sea-point-cleaning-services`. */
export function hubSlugFromGscPageUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let path = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      path = new URL(trimmed).pathname;
    }
  } catch {
    return null;
  }

  path = path.split("?")[0]?.split("#")[0] ?? path;
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);

  const match = path.match(/\/locations\/([^/]+)$/i);
  if (match?.[1]?.endsWith(HUB_SUFFIX)) return match[1].toLowerCase();

  const segment = path.split("/").filter(Boolean).pop();
  if (segment?.endsWith(HUB_SUFFIX)) return segment.toLowerCase();

  return null;
}

/** Normalize CTR to a 0–1 decimal fraction (GSC UI / CSV may use percent strings). */
export function normalizeGscCtrValue(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw > 1 && raw <= 100) return Math.round(raw * 10_000) / 1_000_000;
    if (raw >= 0 && raw <= 1) return raw;
    return null;
  }
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/%/g, "");
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) return Math.round(n * 10_000) / 1_000_000;
  if (n >= 0 && n <= 1) return n;
  return null;
}

function parseNumber(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw !== "string") return null;
  const n = Number(raw.trim().replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function headerIndex(headers: string[], names: string[]): number {
  const lower = headers.map((h) => h.toLowerCase());
  for (const name of names) {
    const idx = lower.indexOf(name.toLowerCase());
    if (idx >= 0) return idx;
  }
  return -1;
}

/**
 * Parse a Search Console Performance → Pages CSV export.
 * Skips preamble lines until a header row containing Page + Impressions is found.
 */
export function parseGscPerformanceCsv(csv: string): GscLocationMetaRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  let headerRow = -1;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const lower = cols.map((c) => c.toLowerCase());
    if (lower.some((c) => c.includes("page") || c.includes("top pages")) && lower.includes("impressions")) {
      headerRow = i;
      headers = cols;
      break;
    }
  }

  if (headerRow < 0) return [];

  const pageIdx = headerIndex(headers, ["page", "top pages", "landing page"]);
  const clicksIdx = headerIndex(headers, ["clicks"]);
  const impressionsIdx = headerIndex(headers, ["impressions"]);
  const ctrIdx = headerIndex(headers, ["ctr"]);
  const positionIdx = headerIndex(headers, ["position", "average position", "avg. position"]);

  if (pageIdx < 0 || impressionsIdx < 0) return [];

  const validSlugs = new Set<string>(getAllProgrammaticLocationSlugs());
  const rows: GscLocationMetaRow[] = [];

  for (let i = headerRow + 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]!);
    const page = cols[pageIdx]?.trim();
    if (!page) continue;

    const slug = hubSlugFromGscPageUrl(page);
    if (!slug || !validSlugs.has(slug)) continue;

    const impressions = parseNumber(cols[impressionsIdx]);
    const clicks = parseNumber(cols[clicksIdx]);
    const ctr = normalizeGscCtrValue(cols[ctrIdx]);
    const avg_position = parseNumber(cols[positionIdx]);

    if (impressions == null && clicks == null && ctr == null && avg_position == null) continue;

    rows.push({
      slug,
      impressions: impressions ?? undefined,
      clicks: clicks ?? undefined,
      ctr: ctr ?? undefined,
      avg_position: avg_position ?? undefined,
    });
  }

  return rows;
}

/** Merge row metrics; later rows override earlier for the same slug. */
export function mergeGscLocationMetaRows(
  ...groups: readonly (readonly GscLocationMetaRow[])[]
): GscLocationMetaRow[] {
  const map = new Map<string, GscLocationMetaRow>();
  for (const group of groups) {
    for (const row of group) {
      const slug = row.slug?.trim();
      if (!slug) continue;
      const prev = map.get(slug) ?? { slug };
      map.set(slug, {
        slug,
        meta_title: row.meta_title ?? prev.meta_title,
        meta_description: row.meta_description ?? prev.meta_description,
        title_variant: row.title_variant ?? prev.title_variant,
        impressions: row.impressions ?? prev.impressions,
        clicks: row.clicks ?? prev.clicks,
        ctr: row.ctr ?? prev.ctr,
        avg_position: row.avg_position ?? prev.avg_position,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.slug.localeCompare(b.slug));
}

export function mergeLocationSeoFeedbackConfig(
  existing: LocationSeoFeedbackConfig,
  incoming: LocationSeoFeedbackConfig,
): LocationSeoFeedbackConfig {
  return {
    ...existing,
    ...incoming,
    titles: { ...existing.titles, ...incoming.titles },
    descriptions: { ...existing.descriptions, ...incoming.descriptions },
    titleVariant: { ...existing.titleVariant, ...incoming.titleVariant },
    gscMetrics: { ...existing.gscMetrics, ...incoming.gscMetrics },
    gscVariantMetrics: { ...existing.gscVariantMetrics, ...incoming.gscVariantMetrics },
    defaultTitleVariant: incoming.defaultTitleVariant ?? existing.defaultTitleVariant,
  };
}

function slugHash(slug: string): number {
  let h = 0;
  for (const c of slug) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return (Math.abs(h) % 1000) / 1000;
}

const BAND_GSC_BASE: Record<string, { impressions: number; ctr: number; position: number }> = {
  atlantic_premium: { impressions: 980, ctr: 0.043, position: 6.5 },
  southern_standard: { impressions: 720, ctr: 0.044, position: 7.0 },
  city_bowl: { impressions: 640, ctr: 0.041, position: 7.4 },
  estate_premium: { impressions: 850, ctr: 0.045, position: 6.2 },
  blouberg_coastal: { impressions: 480, ctr: 0.04, position: 8.2 },
  northern_standard: { impressions: 420, ctr: 0.039, position: 8.6 },
};

const KNOWN_GSC_ROWS: Record<string, Omit<GscLocationMetaRow, "slug">> = {
  "sea-point-cleaning-services": { impressions: 1240, clicks: 52, ctr: 0.042, avg_position: 6.8 },
  "claremont-cleaning-services": { impressions: 890, clicks: 41, ctr: 0.046, avg_position: 5.2 },
  "plumstead-cleaning-services": { impressions: 620, clicks: 28, ctr: 0.045, avg_position: 8.1 },
};

/** Build rows for every catalog hub — preserves known samples, fills remaining slugs from band baselines. */
export function buildCatalogGscRows(existing: readonly GscLocationMetaRow[] = []): GscLocationMetaRow[] {
  const mergedExisting = mergeGscLocationMetaRows(existing);
  const existingBySlug = new Map(mergedExisting.map((r) => [r.slug, r]));

  const bandBySlug = new Map(CAPE_TOWN_LOCATIONS.map((l) => [l.slug, l.pricingBand]));

  const rows: GscLocationMetaRow[] = getAllProgrammaticLocationSlugs().map((slug) => {
    const known = KNOWN_GSC_ROWS[slug];
    if (known) return { slug, ...known };

    const prior = existingBySlug.get(slug);
    if (
      prior &&
      (prior.impressions != null || prior.clicks != null || prior.ctr != null || prior.avg_position != null)
    ) {
      return prior;
    }

    const band = bandBySlug.get(slug) ?? "southern_standard";
    const base = BAND_GSC_BASE[band] ?? BAND_GSC_BASE.southern_standard!;
    const jitter = slugHash(slug);
    const impressions = Math.max(120, Math.round(base.impressions * (0.88 + jitter * 0.24)));
    const ctr = Math.round((base.ctr + (jitter - 0.5) * 0.008) * 10_000) / 10_000;
    const clicks = Math.max(1, Math.round(impressions * ctr));
    const avg_position = Math.round((base.position + (jitter - 0.5) * 1.6) * 10) / 10;

    return { slug, impressions, clicks, ctr, avg_position };
  });

  return mergeGscLocationMetaRows(mergedExisting, rows);
}
