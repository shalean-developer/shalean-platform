/**
 * Build `LOCATION_SEO_FEEDBACK_JSON` payloads from curated rows (e.g. Search Console → spreadsheet → JSON).
 * Does not call the Google Search Console API — ship exports through your own pipeline or admin tooling.
 */

export type GscLocationMetaRow = {
  /** Programmatic hub slug, e.g. `sea-point-cleaning-services` */
  slug: string;
  meta_title?: string;
  meta_description?: string;
  /** Sets `LOCATION_SEO_FEEDBACK_JSON.titleVariant[slug]` for A/B/C template testing. */
  title_variant?: "A" | "B" | "C";
  /** Optional Search Console metrics (manual paste from exports). */
  impressions?: number;
  clicks?: number;
  /** CTR as decimal fraction, e.g. 0.048 */
  ctr?: number;
  avg_position?: number;
};

/** Merge rows into the JSON shape consumed by {@link mergeLocationMetaTitle} / {@link mergeLocationMetaDescription}. */
export function rowsToLocationSeoFeedbackConfig(rows: readonly GscLocationMetaRow[]): {
  titles: Record<string, string>;
  descriptions: Record<string, string>;
  titleVariant?: Record<string, "A" | "B" | "C">;
  gscMetrics?: Record<string, Record<string, number>>;
} {
  const titles: Record<string, string> = {};
  const descriptions: Record<string, string> = {};
  const titleVariant: Record<string, "A" | "B" | "C"> = {};
  const gscMetrics: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const slug = String(r.slug ?? "").trim();
    if (!slug) continue;
    const t = r.meta_title?.trim();
    const d = r.meta_description?.trim();
    if (t) titles[slug] = t;
    if (d) descriptions[slug] = d;
    const tv = r.title_variant;
    if (tv === "A" || tv === "B" || tv === "C") titleVariant[slug] = tv;

    const snap: Record<string, number> = {};
    if (typeof r.impressions === "number" && Number.isFinite(r.impressions)) snap.impressions = r.impressions;
    if (typeof r.clicks === "number" && Number.isFinite(r.clicks)) snap.clicks = r.clicks;
    if (typeof r.ctr === "number" && Number.isFinite(r.ctr)) snap.ctr = r.ctr;
    if (typeof r.avg_position === "number" && Number.isFinite(r.avg_position)) snap.avg_position = r.avg_position;
    if (Object.keys(snap).length > 0) gscMetrics[slug] = snap;
  }
  const payload: {
    titles: Record<string, string>;
    descriptions: Record<string, string>;
    titleVariant?: Record<string, "A" | "B" | "C">;
    gscMetrics?: Record<string, Record<string, number>>;
  } = { titles, descriptions };
  if (Object.keys(titleVariant).length > 0) payload.titleVariant = titleVariant;
  if (Object.keys(gscMetrics).length > 0) payload.gscMetrics = gscMetrics;
  return payload;
}

/** Merge rows into the JSON shape consumed by {@link mergeLocationMetaTitle} / {@link mergeLocationMetaDescription}. */
export function rowsToLocationSeoFeedbackJson(rows: readonly GscLocationMetaRow[]): string {
  return JSON.stringify(rowsToLocationSeoFeedbackConfig(rows));
}
