import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveSemanticClusterKey, semanticClusterKeyToCollisionTagSlug } from "@/lib/seo/blogGovernance";
import { fetchPublishedClusterPeersUnified } from "@/lib/blog/seo/fetch-cluster-peer-posts";
import type { ClusterPeerPost } from "@/lib/blog/seo/blog-cluster-collision";
import type { BlogContentJson } from "@/lib/blog/content-json";
import { validateBlogPublish } from "@/lib/blog/seo/publish-validation";
async function blogTagSlugsForIds(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  tagIds: string[] | undefined,
): Promise<string[]> {
  if (!tagIds?.length) return [];
  const { data, error } = await admin.from("blog_tags").select("slug").in("id", tagIds);
  if (error) throw new Error("Unable to validate selected tags.");
  if (!data) return [];
  return (data as { slug?: string }[]).map((r) => String(r.slug ?? ""));
}

export async function runPublishGovernanceValidation(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  params: {
    content: BlogContentJson;
    tag_ids: string[] | undefined;
    slug: string;
    title: string;
    primary_keyword: string | null;
    semantic_cluster?: string | null;
  },
) {
  const tagSlugs = await blogTagSlugsForIds(admin, params.tag_ids);
  const semanticKey = resolveSemanticClusterKey({
    persisted: params.semantic_cluster,
    tags: tagSlugs,
  });
  const clusterTagForLegacy = semanticClusterKeyToCollisionTagSlug(semanticKey);
  let clusterPeers: ClusterPeerPost[] = [];
  if (params.slug.trim() && (semanticKey || clusterTagForLegacy)) {
    clusterPeers = await fetchPublishedClusterPeersUnified(admin, {
      excludeSlug: params.slug.trim(),
      semanticClusterKey: semanticKey,
      clusterTagSlug: clusterTagForLegacy,
    });
  }
  return validateBlogPublish(params.content, {
    tags: tagSlugs,
    semanticCluster: semanticKey ?? undefined,
    clusterPeers,
    slug: params.slug.trim(),
    title: params.title.trim(),
    primaryKeyword: params.primary_keyword,
    collisionClusterTagSlug: clusterTagForLegacy ?? undefined,
  });
}

