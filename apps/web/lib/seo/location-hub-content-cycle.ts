import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

/**
 * Editorial freshness signalling + documented refresh cadence (pair with calendar reminders).
 * Optional: set LOCATION_HUB_LAST_CONTENT_REFRESH=2026-05-01 (ISO date) to stamp “reviewed” messaging.
 *
 * `hubRotatingFreshnessParagraph` rotates light copy every ~40 days (deterministic per slug) so pages
 * can show editorial movement without full rewrites.
 */

const DAY_MS = 86_400_000;
/** ~40-day editorial rotation bucket (adjust calendar reminders to match). */
export const LOCATION_HUB_CONTENT_CYCLE_DAYS = 40;

function hashSlug(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Integer epoch: increments every `LOCATION_HUB_CONTENT_CYCLE_DAYS` — stable across deploys for a window. */
export function locationHubContentCycleEpoch(nowMs: number = Date.now()): number {
  return Math.floor(nowMs / (DAY_MS * LOCATION_HUB_CONTENT_CYCLE_DAYS));
}

/**
 * One paragraph that can change wording each cycle — booking scenarios rotate; avoids duplicate hub intros.
 */
export function hubRotatingFreshnessParagraph(loc: CapeTownLocationRow, nowMs?: number): string {
  const epoch = locationHubContentCycleEpoch(nowMs);
  const idx = (hashSlug(loc.slug) + epoch) % 4;
  const area = loc.name;
  const variants = [
    `This quarter we’re seeing steady demand for mid-week standard cleans in ${area} — families locking kitchens and bathrooms before school breaks, with parking notes cutting arrival delays.`,
    `Recent routing in ${area} skews slightly toward deep resets after windy weeks and salty-air grit — customers who flag balconies and outdoor zones upfront get quotes that match mop-and-detail time.`,
    `Turnover-style bookings in ${area} continue through checkout-heavy weekends; hosts who list linen resets and fridge fronts early rarely need scope changes on the day.`,
    `Move-out scopes in ${area} spike around lease-end months — ovens, grout lines, and bathroom counts drive totals more than street prestige; accurate room maths keeps inspections aligned.`,
  ];
  return variants[idx]!;
}

export function hubContentRefreshCadenceNote(): string {
  return "Suburb hubs are reviewed on a rolling 45-day cadence—pricing bands, FAQs, and guides stay aligned with live booking behaviour.";
}

/** Display copy when env signals a deliberate content review (otherwise omit second sentence). */
export function hubOptionalContentReviewLine(): string | null {
  const raw = process.env.LOCATION_HUB_LAST_CONTENT_REFRESH?.trim();
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  const label = new Intl.DateTimeFormat("en-ZA", {
    month: "long",
    year: "numeric",
    day: "numeric",
    timeZone: "Africa/Johannesburg",
  }).format(d);
  return `Last editorial review: ${label}.`;
}
