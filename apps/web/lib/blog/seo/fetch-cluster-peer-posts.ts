import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClusterPeerPost } from "@/lib/blog/seo/blog-cluster-collision";

function mapPeerRow(p: {
  slug?: string;
  title?: string;
  primary_keyword?: string | null;
  published_at?: string | null;
}): ClusterPeerPost {
  return {
    slug: String(p.slug ?? ""),
    title: String(p.title ?? ""),
    primary_keyword: p.primary_keyword == null ? null : String(p.primary_keyword),
    published_at: p.published_at == null || p.published_at === "" ? null : String(p.published_at),
  };
}

/**
 * Published posts with the same persisted `semantic_cluster`, excluding one slug.
 */
export async function fetchPublishedClusterPeersBySemanticColumn(
  admin: SupabaseClient,
  params: { semanticClusterKey: string; excludeSlug: string; publishedBeforeIso?: string | null },
): Promise<ClusterPeerPost[]> {
  const key = params.semanticClusterKey.trim().toLowerCase();
  const exclude = params.excludeSlug.trim().toLowerCase();
  if (!key) return [];

  let q = admin
    .from("blog_posts")
    .select("slug,title,primary_keyword,status,published_at")
    .eq("status", "published")
    .eq("semantic_cluster", key)
    .neq("slug", exclude);
  if (params.publishedBeforeIso) {
    q = q.lte("published_at", params.publishedBeforeIso);
  }

  const { data, error } = await q;

  if (error || !data?.length) return [];

  return (data as { slug?: string; title?: string; primary_keyword?: string | null; published_at?: string | null }[])
    .map(mapPeerRow)
    .filter((p) => p.slug);
}

/**
 * Merge column-scoped peers (durable `semantic_cluster`) with tag-scoped peers (legacy rows).
 */
export async function fetchPublishedClusterPeersUnified(
  admin: SupabaseClient,
  params: {
    excludeSlug: string;
    semanticClusterKey: string | null;
    clusterTagSlug: string | null;
    /** When set, only peers with `published_at` ≤ this instant (public live listing). */
    publishedBeforeIso?: string | null;
  },
): Promise<ClusterPeerPost[]> {
  const bySlug = new Map<string, ClusterPeerPost>();
  const ex = params.excludeSlug.trim().toLowerCase();
  const before = params.publishedBeforeIso?.trim() || null;

  if (params.semanticClusterKey) {
    const col = await fetchPublishedClusterPeersBySemanticColumn(admin, {
      semanticClusterKey: params.semanticClusterKey,
      excludeSlug: params.excludeSlug,
      publishedBeforeIso: before,
    });
    for (const p of col) {
      if (p.slug.toLowerCase() !== ex) bySlug.set(p.slug.toLowerCase(), p);
    }
  }

  if (params.clusterTagSlug) {
    const tagPeers = await fetchPublishedClusterPeers(admin, {
      clusterTagSlug: params.clusterTagSlug,
      excludeSlug: params.excludeSlug,
      publishedBeforeIso: before,
    });
    for (const p of tagPeers) {
      const k = p.slug.toLowerCase();
      if (k !== ex && !bySlug.has(k)) bySlug.set(k, p);
    }
  }

  return [...bySlug.values()];
}

/**
 * Published posts that share a cluster taxonomy tag (e.g. cluster-1), excluding one slug.
 */
export async function fetchPublishedClusterPeers(
  admin: SupabaseClient,
  params: { clusterTagSlug: string; excludeSlug: string; publishedBeforeIso?: string | null },
): Promise<ClusterPeerPost[]> {
  const tagSlug = params.clusterTagSlug.trim().toLowerCase();
  const exclude = params.excludeSlug.trim().toLowerCase();
  if (!tagSlug) return [];

  const { data: tagRow, error: tagErr } = await admin.from("blog_tags").select("id").eq("slug", tagSlug).maybeSingle();
  if (tagErr || !tagRow?.id) return [];

  const { data: links, error: linkErr } = await admin
    .from("blog_post_tags")
    .select("post_id")
    .eq("tag_id", String(tagRow.id));
  if (linkErr || !links?.length) return [];

  const ids = [...new Set(links.map((r: { post_id?: string }) => String(r.post_id ?? "")).filter(Boolean))];
  if (ids.length === 0) return [];

  let pq = admin
    .from("blog_posts")
    .select("slug,title,primary_keyword,status,published_at")
    .in("id", ids)
    .eq("status", "published");
  if (params.publishedBeforeIso) {
    pq = pq.lte("published_at", params.publishedBeforeIso);
  }

  const { data: posts, error: postErr } = await pq;

  if (postErr || !posts?.length) return [];

  return (posts as { slug?: string; title?: string; primary_keyword?: string | null; published_at?: string | null }[])
    .map(mapPeerRow)
    .filter((p) => p.slug && p.slug.toLowerCase() !== exclude);
}
