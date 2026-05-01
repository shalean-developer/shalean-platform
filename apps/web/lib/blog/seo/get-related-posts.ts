import { LOCATIONS } from "@/lib/locations";

export type RelatedPostInput = {
  slug: string;
  title: string;
  category_id?: string | null;
  /** ISO timestamp; used as tie-break when scores tie (newer first). */
  published_at?: string | null;
};

const CITY_SLUGS = [...new Set(LOCATIONS.map((l) => l.citySlug))].sort((a, b) => b.length - a.length);

export function parseProgrammaticSlugFeatures(slug: string): {
  serviceSlug?: string;
  locationSlug?: string;
  citySlug?: string;
} | null {
  for (const city of CITY_SLUGS) {
    if (!slug.endsWith(`-${city}`)) continue;
    const withoutCity = slug.slice(0, -(city.length + 1));
    const locs = [...LOCATIONS].sort((a, b) => b.slug.length - a.slug.length);
    for (const loc of locs) {
      const suf = `-${loc.slug}`;
      if (withoutCity.endsWith(suf)) {
        const service = withoutCity.slice(0, -suf.length);
        if (service) return { serviceSlug: service, locationSlug: loc.slug, citySlug: city };
      }
    }
  }
  return null;
}

function scorePair(
  a: { category_id?: string | null; facets?: ReturnType<typeof parseProgrammaticSlugFeatures> },
  b: { category_id?: string | null; facets?: ReturnType<typeof parseProgrammaticSlugFeatures> },
): number {
  let s = 0;
  if (a.category_id && b.category_id && a.category_id === b.category_id) s += 25;
  if (a.facets?.locationSlug && b.facets?.locationSlug && a.facets.locationSlug === b.facets.locationSlug) s += 40;
  if (a.facets?.serviceSlug && b.facets?.serviceSlug && a.facets.serviceSlug === b.facets.serviceSlug) s += 35;
  if (a.facets?.citySlug && b.facets?.citySlug && a.facets.citySlug === b.facets.citySlug) s += 10;
  return s;
}

function publishedTs(p: RelatedPostInput): number {
  const raw = p.published_at;
  if (!raw || typeof raw !== "string") return 0;
  const t = Date.parse(raw);
  return Number.isFinite(t) ? t : 0;
}

export function getRelatedPosts(
  currentPost: RelatedPostInput,
  allPosts: RelatedPostInput[],
  opts?: { limit?: number },
): RelatedPostInput[] {
  const limit = Math.min(5, Math.max(3, opts?.limit ?? 4));
  const curFacets = parseProgrammaticSlugFeatures(currentPost.slug);
  const cur = { ...currentPost, facets: curFacets ?? undefined };

  const ranked = allPosts
    .filter((p) => p.slug !== currentPost.slug)
    .map((p) => ({
      post: p,
      score: scorePair(cur, { ...p, facets: parseProgrammaticSlugFeatures(p.slug) ?? undefined }),
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        publishedTs(b.post) - publishedTs(a.post) ||
        a.post.title.localeCompare(b.post.title),
    );

  const out: RelatedPostInput[] = [];
  const seen = new Set<string>();
  for (const { post } of ranked) {
    if (seen.has(post.slug)) continue;
    if (out.length >= limit) break;
    seen.add(post.slug);
    out.push(post);
  }

  if (out.length < 3) {
    for (const { post } of ranked) {
      if (seen.has(post.slug)) continue;
      out.push(post);
      seen.add(post.slug);
      if (out.length >= 3) break;
    }
  }

  return out.slice(0, limit);
}
