import { slugifyTitle } from "@/lib/blog/slugify-title";
import { LOCATIONS } from "@/lib/locations";
import { CAPE_TOWN_SEO_SERVICE_SLUGS } from "@/lib/seo/capeTownSeoPages";

export type ContentGapTopic = {
  suggestedSlug: string;
  keywordPhrase: string;
  locationSlug: string;
  citySlug: string;
  serviceSlug: string;
  locationName: string;
  cityName: string;
  serviceName: string;
};

function serviceKeyFromSeoSlug(seo: string): string {
  return seo.replace(/-cape-town$/u, "");
}

function serviceDisplayName(key: string): string {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** All programmatic location × service combinations (city hub rows excluded for suburb matrix). */
export function buildProgrammaticTopicMatrix(): ContentGapTopic[] {
  const serviceKeys = CAPE_TOWN_SEO_SERVICE_SLUGS.map(serviceKeyFromSeoSlug);
  const locations = LOCATIONS.filter((l) => l.slug !== l.citySlug);
  const topics: ContentGapTopic[] = [];

  for (const loc of locations) {
    for (const serviceSlug of serviceKeys) {
      const serviceName = serviceDisplayName(serviceSlug);
      const suggestedSlug = `${serviceSlug}-${loc.slug}-${loc.citySlug}`.slice(0, 120).replace(/-+$/g, "");
      topics.push({
        suggestedSlug,
        keywordPhrase: `${serviceName} ${loc.name} ${loc.cityName}`.toLowerCase(),
        locationSlug: loc.slug,
        citySlug: loc.citySlug,
        serviceSlug,
        locationName: loc.name,
        cityName: loc.cityName,
        serviceName,
      });
    }
  }

  return topics;
}

function normalizeSlugSet(existing: Iterable<string>): Set<string> {
  return new Set([...existing].map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Topics from the matrix that are not yet covered by `existingSlugs`.
 */
export function findMatrixContentGaps(existingSlugs: Iterable<string>, matrix?: ContentGapTopic[]): ContentGapTopic[] {
  const have = normalizeSlugSet(existingSlugs);
  const m = matrix ?? buildProgrammaticTopicMatrix();
  return m.filter((t) => !have.has(t.suggestedSlug.toLowerCase()));
}

/**
 * Map a free-form keyword variation to a matrix topic when location + service can be inferred from the phrase.
 */
export function matchVariationToTopic(
  variation: string,
  matrix: ContentGapTopic[] = buildProgrammaticTopicMatrix(),
): ContentGapTopic | null {
  const v = variation.toLowerCase().replace(/\s+/g, " ").trim();
  if (!v) return null;

  let best: ContentGapTopic | null = null;
  let bestScore = 0;

  for (const t of matrix) {
    const locN = t.locationName.toLowerCase();
    const cityN = t.cityName.toLowerCase();
    const svcN = t.serviceName.toLowerCase();
    const svcSlugPart = t.serviceSlug.toLowerCase().replace(/-/g, " ");

    let score = 0;
    if (v.includes(locN)) score += 5;
    if (v.includes(cityN)) score += 2;
    if (v.includes(svcN) || v.includes(svcSlugPart)) score += 4;
    const slugAsPhrase = t.suggestedSlug.replace(/-/g, " ");
    if (v.includes(slugAsPhrase.slice(0, 24))) score += 1;

    if (score > bestScore) {
      bestScore = score;
      best = t;
    }
  }

  return bestScore >= 7 ? best : null;
}

export type ContentGapReport = {
  missingMatrixTopics: ContentGapTopic[];
  /** Variations that did not resolve to a known matrix topic (editorial / future templates). */
  orphanKeywordPhrases: string[];
};

/**
 * Compares keyword variations to the programmatic matrix: returns missing slugs plus unmatched phrases.
 */
export function findContentGaps(options: {
  existingSlugs: Iterable<string>;
  keywordVariations: string[];
  matrix?: ContentGapTopic[];
}): ContentGapReport {
  const matrix = options.matrix ?? buildProgrammaticTopicMatrix();
  const missingMatrixTopics = findMatrixContentGaps(options.existingSlugs, matrix);
  const orphanKeywordPhrases: string[] = [];

  for (const phrase of options.keywordVariations) {
    const hit = matchVariationToTopic(phrase, matrix);
    if (!hit && phrase.trim().length > 24) {
      const slugGuess = slugifyTitle(phrase);
      if (slugGuess.length > 12) orphanKeywordPhrases.push(phrase);
    }
  }

  return {
    missingMatrixTopics,
    orphanKeywordPhrases: [...new Set(orphanKeywordPhrases)],
  };
}
