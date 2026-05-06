/**
 * Upsert legacy editorial fallback posts into `blog_posts` as drafts (single source of truth).
 *
 * From apps/web:
 *   npx tsx scripts/migrateFallbackPostsToDB.ts
 *   npx tsx scripts/migrateFallbackPostsToDB.ts --dry-run
 *
 * Skips slugs that already have status `published` (never overwrite live posts).
 * Other rows: insert or update with status `draft`, source `editorial`.
 */

import "./load-apps-web-env";

import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown } from "@/lib/blog/cluster-related-guides-legacy-markdown-guard";
import { FALLBACK_EDITORIAL_MIGRATE_SEEDS } from "@/lib/blog/seed/fallbackEditorialMigratePayload";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  for (const post of FALLBACK_EDITORIAL_MIGRATE_SEEDS) {
    const parsed = blogContentJsonSchema.safeParse(post.content_json);
    if (!parsed.success) {
      console.error(`INVALID ${post.slug}:`, parsed.error.flatten());
      process.exitCode = 1;
      return;
    }
    warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(parsed.data, {
      slug: post.slug,
      source: "migrateFallbackPostsToDB",
    });
  }

  if (dryRun) {
    console.log("Dry run — schema OK for", FALLBACK_EDITORIAL_MIGRATE_SEEDS.length, "posts. No database writes.");
    return;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error("Missing Supabase admin client (SUPABASE_SERVICE_ROLE_KEY / URL).");
    process.exitCode = 1;
    return;
  }

  const nowIso = new Date().toISOString();

  for (const post of FALLBACK_EDITORIAL_MIGRATE_SEEDS) {
    const parsed = blogContentJsonSchema.parse(post.content_json);
    const reading_time_minutes = computeReadingTimeMinutes(parsed);

    const { data: existing, error: selErr } = await admin
      .from("blog_posts")
      .select("id,status")
      .eq("slug", post.slug)
      .maybeSingle();

    if (selErr) {
      console.error(`Select failed ${post.slug}:`, selErr.message);
      process.exitCode = 1;
      return;
    }

    if (existing && (existing as { status?: string }).status === "published") {
      console.log(`Skip (already published): ${post.slug}`);
      continue;
    }

    const row = {
      slug: post.slug,
      title: post.title,
      h1: post.h1,
      excerpt: post.excerpt,
      status: "draft" as const,
      source: "editorial" as const,
      published_at: null as string | null,
      meta_title: post.meta_title,
      meta_description: post.meta_description,
      canonical_url: `/blog/${post.slug}`,
      featured_image_url: post.featured_image_url,
      featured_image_alt: post.featured_image_alt,
      content_json: parsed,
      reading_time_minutes,
      primary_keyword: post.primary_keyword,
      secondary_keywords: post.secondary_keywords,
      search_intent: post.search_intent,
      noindex: false,
      updated_at: nowIso,
    };

    if (existing?.id) {
      const { error } = await admin.from("blog_posts").update(row).eq("id", (existing as { id: string }).id);
      if (error) {
        console.error(`Update failed ${post.slug}:`, error.message);
        process.exitCode = 1;
        return;
      }
      console.log(`Updated draft: ${post.slug}`);
    } else {
      const { error } = await admin.from("blog_posts").insert(row);
      if (error) {
        console.error(`Insert failed ${post.slug}:`, error.message);
        process.exitCode = 1;
        return;
      }
      console.log(`Inserted draft: ${post.slug}`);
    }
  }

  console.log("\nDone. Publish the four rows in admin when ready so routes resolve via getPostBySlug.");
}

main();
