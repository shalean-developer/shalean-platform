import { NextResponse } from "next/server";
import { requireAdminRequest } from "@/lib/api/admin-auth-request";
import { fetchPublishedClusterPeersUnified } from "@/lib/blog/seo/fetch-cluster-peer-posts";
import {
  resolveSemanticClusterKey,
  semanticClusterKeyToCollisionTagSlug,
} from "@/lib/seo/blogGovernance";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Published posts in the same collision cluster tag (e.g. cluster-2), excluding one slug.
 * Used by the admin editor for semantic-overlap preview (warn-only).
 */
export async function GET(request: Request) {
  const auth = await requireAdminRequest(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { searchParams } = new URL(request.url);
  const excludeSlug = (searchParams.get("exclude_slug") ?? "").trim();
  const tagSlugs = (searchParams.get("tag_slugs") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const semanticClusterRaw = searchParams.get("semantic_cluster");

  const semanticKey = resolveSemanticClusterKey({
    persisted: semanticClusterRaw,
    tags: tagSlugs,
  });
  const clusterTag = semanticClusterKeyToCollisionTagSlug(semanticKey);
  if (!excludeSlug || (!semanticKey && !clusterTag)) {
    return NextResponse.json({ peers: [], cluster_tag: clusterTag, semantic_cluster: semanticKey });
  }

  const peers = await fetchPublishedClusterPeersUnified(admin, {
    excludeSlug,
    semanticClusterKey: semanticKey,
    clusterTagSlug: clusterTag,
  });
  return NextResponse.json({ peers, cluster_tag: clusterTag, semantic_cluster: semanticKey });
}
