import type { SupabaseClient } from "@supabase/supabase-js";
import { blogContentJsonSchema } from "./content-json-schema";
import { validateCmsBlogLinksForAdminSave } from "./cms-blog-link-validation";
import { runPublishGovernanceValidation } from "./validate-blog-release";
import { isRedirectAliasBlogSlug } from "./validBlogRoutes";
import { findUnsupportedBlogImages } from "./blog-image-validation";
import { isAllowedAuthoringBlogImageSrc } from "@/lib/blog/blog-image-validation";

/** Bounded, compare-and-swap release: retries cannot publish twice or overwrite an edit. */
export async function publishScheduledBlogPosts(admin: SupabaseClient, invalidate: (slug: string) => void, now = new Date()) {
  const { data, error } = await admin.from("blog_posts").select("*").eq("status", "scheduled").lte("published_at", now.toISOString()).order("published_at").limit(25);
  if (error) throw new Error("Unable to load scheduled posts.");
  const result = { published: 0, held: 0, superseded: 0 };
  for (const row of data ?? []) {
    let reason: string | null = null;
    try {
      const { data: permitted, error: permissionError } = await admin.rpc("admin_has_permission", { p_user_id: row.scheduled_by, p_permission: "content.publish", p_branch_id: null, p_team_id: null });
      if (permissionError || !row.scheduled_by || permitted !== true) throw new Error("Publisher permission is missing or revoked. An authorized publisher must reschedule.");
      const content = blogContentJsonSchema.parse(row.content_json);
      if (isRedirectAliasBlogSlug(row.slug)) throw new Error("Retired redirect-only slug cannot publish.");
      if (findUnsupportedBlogImages(content).length || (row.featured_image_url && !isAllowedAuthoringBlogImageSrc(row.featured_image_url))) throw new Error("Unsupported image URL.");
      const links = await validateCmsBlogLinksForAdminSave(admin, { slug: row.slug, content, status: "published", canonical_url: row.canonical_url, related_guide_override_slugs: row.related_guide_override_slugs });
      if (links.length) throw new Error(`Internal link validation failed: ${links[0].fieldPath}.`);
      const { data: tags, error: tagError } = await admin.from("blog_post_tags").select("tag_id").eq("post_id", row.id);
      if (tagError) throw new Error("Unable to validate tags.");
      const quality = await runPublishGovernanceValidation(admin, { content, slug: row.slug, title: row.title, tag_ids: (tags ?? []).map(t => String(t.tag_id)), primary_keyword: row.primary_keyword, semantic_cluster: row.semantic_cluster });
      if (!quality.ok) throw new Error(quality.issues.map(i => i.message).join(" "));
    } catch (error) { reason = (error instanceof Error ? error.message : "Publication validation failed.").slice(0,1000); }
    if (reason) {
      if (row.last_schedule_error !== reason) {
        const { error: holdError } = await admin.from("blog_posts").update({ last_schedule_error: reason }).eq("id",row.id).eq("updated_at",row.updated_at).eq("status","scheduled");
        if (holdError) throw new Error("Unable to record held publication.");
      }
      result.held++; continue;
    }
    const { data: published, error: publishError } = await admin.from("blog_posts").update({ status: "published", last_schedule_error: null }).eq("id",row.id).eq("updated_at",row.updated_at).eq("status","scheduled").select("slug").maybeSingle();
    if (publishError) throw new Error("Scheduled publication failed.");
    if (!published) { result.superseded++; continue; }
    invalidate(published.slug); result.published++;
  }
  return result;
}
