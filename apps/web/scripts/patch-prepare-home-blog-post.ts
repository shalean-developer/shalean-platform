/**
 * One-off repair for governed prepare-home CMS post (featured image + category).
 *
 *   cd apps/web && npx tsx scripts/patch-prepare-home-blog-post.ts [--dry-run]
 */

import "./load-apps-web-env";
import { createClient } from "@supabase/supabase-js";
import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";

const dryRun = process.argv.includes("--dry-run");
const POST_ID = "d19b4220-9c8c-45e1-a692-2829e19678bf";
const SLUG = "how-to-prepare-home-before-cleaner-arrives-cape-town";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url?.trim() || !key?.trim()) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: tipsCat, error: tipsErr } = await admin
    .from("blog_categories")
    .select("id")
    .eq("slug", "tips")
    .maybeSingle();
  if (tipsErr) throw tipsErr;
  const tipsCategoryId = (tipsCat as { id?: string } | null)?.id ?? null;

  const patch = {
    featured_image_url: resolveBlogFeaturedSrc(SLUG, null),
    featured_image_alt: resolveBlogFeaturedAlt(SLUG, null),
    category_id: tipsCategoryId,
  };

  console.log(dryRun ? "[dry-run]" : "[apply]", { postId: POST_ID, ...patch });

  if (dryRun) return;

  const { error } = await admin.from("blog_posts").update(patch).eq("id", POST_ID);
  if (error) throw error;
  console.log("Updated post", POST_ID);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
