import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClusterPeerPost } from "@/lib/blog/seo/blog-cluster-collision";
import { fetchPublishedClusterPeersUnified } from "@/lib/blog/seo/fetch-cluster-peer-posts";
import { intentLabelForClusterGuideSlug } from "@/lib/blog/cluster-guide-intent-labels";
import { getCanonicalBlogSlug } from "@/lib/blog/validBlogRoutes";
import { resolveSemanticClusterKey, semanticClusterKeyToCollisionTagSlug } from "@/lib/seo/blogGovernance";

export type ClusterRelatedGuideItem = {
  slug: string;
  title: string;
  intentLabel: string;
};

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Normalize + validate blog slugs for `related_guide_override_slugs` (DB + API). */
export function normalizeManualRelatedGuideSlugs(raw: string[] | null | undefined, cap = 8): string[] | null {
  const n = normalizeOverrideSlugs(raw ?? undefined, cap);
  return n.length ? n : null;
}

function normalizeOverrideSlugs(raw: string[] | null | undefined, cap: number): string[] {
  if (!raw?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const trimmed = String(s).trim().toLowerCase();
    if (!trimmed || !SLUG_RE.test(trimmed)) continue;
    const t = getCanonicalBlogSlug(trimmed);
    if (!t || !SLUG_RE.test(t) || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= cap) break;
  }
  return out;
}

function sortPeersStable(peers: ClusterPeerPost[]): ClusterPeerPost[] {
  return [...peers].sort((a, b) => {
    const pa = (a.published_at ?? "").trim();
    const pb = (b.published_at ?? "").trim();
    if (pa !== pb) return pb.localeCompare(pa);
    return a.slug.localeCompare(b.slug);
  });
}

async function fetchLivePublishedPostMeta(
  supabase: SupabaseClient,
  slug: string,
  publishedBeforeIso: string,
): Promise<{ slug: string; title: string } | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,title")
    .eq("slug", s)
    .eq("status", "published")
    .lte("published_at", publishedBeforeIso)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { slug?: string; title?: string };
  const outSlug = String(row.slug ?? s);
  const title = String(row.title ?? "").trim();
  if (!title) return null;
  return { slug: outSlug, title };
}

/**
 * Merge editorial overrides (first) with cluster peers; de-dupe; cap length.
 * Exported for unit tests.
 */
export function mergeClusterRelatedGuides(args: {
  currentSlug: string;
  orderedOverrideSlugs: string[];
  overridePosts: Map<string, { slug: string; title: string }>;
  peersSorted: ClusterPeerPost[];
  max: number;
}): ClusterRelatedGuideItem[] {
  const ex = args.currentSlug.trim().toLowerCase();
  const seen = new Set<string>();
  const out: ClusterRelatedGuideItem[] = [];

  for (const key of args.orderedOverrideSlugs) {
    if (out.length >= args.max) break;
    const k = key.trim().toLowerCase();
    if (!k || k === ex || seen.has(k)) continue;
    const row = args.overridePosts.get(k);
    if (!row) continue;
    seen.add(k);
    out.push({
      slug: getCanonicalBlogSlug(row.slug),
      title: row.title,
      intentLabel: intentLabelForClusterGuideSlug(row.slug),
    });
  }

  for (const p of args.peersSorted) {
    if (out.length >= args.max) break;
    const k = p.slug.trim().toLowerCase();
    if (!k || k === ex || seen.has(k)) continue;
    seen.add(k);
    out.push({
      slug: getCanonicalBlogSlug(p.slug),
      title: p.title,
      intentLabel: intentLabelForClusterGuideSlug(p.slug),
    });
  }

  return out;
}

/**
 * Public blog: same-cluster published peers + optional `related_guide_override_slugs`, stable order, low volume.
 */
export async function fetchClusterRelatedGuidesForPost(
  supabase: SupabaseClient,
  params: {
    currentSlug: string;
    semanticClusterPersisted: string | null;
    tagSlugs: string[];
    manualRelatedOverrides: string[] | null | undefined;
    /** Inclusive upper bound for `published_at` (typically `new Date().toISOString()`). */
    publishedBeforeIso: string;
    max?: number;
  },
): Promise<ClusterRelatedGuideItem[]> {
  const max = Math.min(5, Math.max(1, params.max ?? 5));
  const overrideCap = 8;
  const orderedOverrides = normalizeOverrideSlugs(params.manualRelatedOverrides ?? undefined, overrideCap);

  const semanticKey = resolveSemanticClusterKey({
    persisted: params.semanticClusterPersisted,
    tags: params.tagSlugs,
  });
  const clusterTag = semanticClusterKeyToCollisionTagSlug(semanticKey);

  if (!semanticKey && !clusterTag && orderedOverrides.length === 0) {
    return [];
  }

  const peersUnified =
    semanticKey || clusterTag
      ? await fetchPublishedClusterPeersUnified(supabase, {
          excludeSlug: params.currentSlug,
          semanticClusterKey: semanticKey,
          clusterTagSlug: clusterTag,
          publishedBeforeIso: params.publishedBeforeIso,
        })
      : [];

  const peersSorted = sortPeersStable(peersUnified);

  const overridePosts = new Map<string, { slug: string; title: string }>();
  await Promise.all(
    orderedOverrides.map(async (slug) => {
      const meta = await fetchLivePublishedPostMeta(supabase, slug, params.publishedBeforeIso);
      if (meta) overridePosts.set(slug.toLowerCase(), meta);
    }),
  );

  return mergeClusterRelatedGuides({
    currentSlug: params.currentSlug,
    orderedOverrideSlugs: orderedOverrides,
    overridePosts,
    peersSorted,
    max,
  });
}
