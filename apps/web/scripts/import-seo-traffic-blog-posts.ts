/**
 * Upsert the 10 SEO traffic funnel posts (draft) into blog_posts.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/import-seo-traffic-blog-posts.ts
 *   npx tsx scripts/import-seo-traffic-blog-posts.ts --dry-run
 *
 * Loads `.env` / `.env.local` from this app (same vars as Next.js). Requires
 * NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) + SUPABASE_SERVICE_ROLE_KEY.
 */

import "./load-apps-web-env";

import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { SEO_TRAFFIC_BLOG_POSTS } from "@/lib/blog/seed/seoTrafficBlogPosts";
import { countWordsInContent, validateBlogPublish } from "@/lib/blog/seo/publish-validation";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  let invalid = 0;
  for (const post of SEO_TRAFFIC_BLOG_POSTS) {
    const parsed = blogContentJsonSchema.safeParse(post.content_json);
    if (!parsed.success) {
      invalid++;
      console.error(`INVALID ${post.slug}:`, parsed.error.flatten());
      continue;
    }
    const words = countWordsInContent(parsed.data);
    const pub = validateBlogPublish(parsed.data);
    console.log(
      `[${post.category}] ${post.slug} — ${words} words · publish checks: ${pub.ok ? "PASS" : "FAIL"} · score ${pub.seoScore}`,
    );
    if (!pub.ok) {
      pub.issues.forEach((i) => console.warn(`   · ${i.code}: ${i.message}`));
    }
  }
  if (invalid > 0) {
    process.exitCode = 1;
    return;
  }

  if (dryRun) {
    console.log("\nDry run — no database writes.");
    return;
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    console.error("Missing Supabase admin client (service role env).");
    process.exitCode = 1;
    return;
  }

  for (const post of SEO_TRAFFIC_BLOG_POSTS) {
    const parsed = blogContentJsonSchema.parse(post.content_json);
    const reading_time_minutes = computeReadingTimeMinutes(parsed);

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
    };

    const { data: existing } = await admin.from("blog_posts").select("id").eq("slug", post.slug).maybeSingle();

    if (existing?.id) {
      const { error } = await admin.from("blog_posts").update(row).eq("id", existing.id);
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

  console.log("\nDone. Review in admin, then publish when ready.");
}

main();
