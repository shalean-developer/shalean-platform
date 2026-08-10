export const SEO_AUTO_APPLY_MIN_CONFIDENCE = 0.35;
export const SEO_AUTO_APPLY_MAX_PER_TYPE = 10;

function normalizeSlug(value: string): string {
  return value.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
}

export function parseManualHubUiSlugs(raw: string | undefined): Set<string> {
  if (!raw?.trim()) return new Set();
  return new Set(
    raw
      .split(",")
      .map(normalizeSlug)
      .filter(Boolean),
  );
}

export function isHubUiAutoApplyAllowed(input: {
  slug: string;
  confidence: number;
  manualHubUiSlugs: ReadonlySet<string>;
}): boolean {
  if (!Number.isFinite(input.confidence) || input.confidence < SEO_AUTO_APPLY_MIN_CONFIDENCE) {
    return false;
  }
  return !input.manualHubUiSlugs.has(normalizeSlug(input.slug));
}

export function isTitleAutoApplyAllowed(input: {
  confidence: number;
  hasManualTitle: boolean;
  hasExplicitEnvVariant: boolean;
}): boolean {
  if (input.hasManualTitle || input.hasExplicitEnvVariant) return false;
  return Number.isFinite(input.confidence) && input.confidence >= SEO_AUTO_APPLY_MIN_CONFIDENCE;
}
