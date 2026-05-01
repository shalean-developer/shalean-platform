/**
 * Re-run internal link + FAQ + meta SEO pass on programmatic drafts (draft-only updates).
 *
 *   cd apps/web && npx tsx scripts/run-internal-link-boost.ts [--dry-run] [--limit=200]
 */

import { createClient } from "@supabase/supabase-js";
import { buildProgrammaticDraftSeoPatch } from "../lib/seo/refresh-programmatic-draft-seo";

const dryRun = process.argv.includes("--dry-run");

function parseLimitArg(): number | undefined {
  const raw = process.argv.find((a) => a.startsWith("--limit="));
  if (!raw) return undefined;
  const n = Number.parseInt(raw.slice("--limit=".length), 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!url?.trim() || !key?.trim()) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  const limit = parseLimitArg() ?? 500;

  const { data: relatedData } = await admin
    .from("blog_posts")
    .select("slug,title")
    .eq("status", "published")
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(60);

  const relatedBlogPosts =
    (relatedData as { slug?: string; title?: string }[] | null)?.flatMap((r) =>
      r.slug && r.title ? [{ slug: r.slug, title: r.title }] : [],
    ) ?? [];

  const { data: drafts, error } = await admin
    .from("blog_posts")
    .select("id,slug,title,meta_title,meta_description,content_json")
    .eq("status", "draft")
    .limit(limit);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let boosted = 0;
  let skipped = 0;

  for (const row of drafts ?? []) {
    try {
      const patch = buildProgrammaticDraftSeoPatch(
        {
          slug: row.slug,
          title: row.title,
          meta_title: row.meta_title,
          meta_description: row.meta_description,
          content_json: row.content_json,
        },
        relatedBlogPosts,
      );

      if (!patch) {
        skipped += 1;
        continue;
      }

      if (dryRun) {
        console.log("[dry-run]", row.slug);
        boosted += 1;
        continue;
      }

      const { error: upErr } = await admin
        .from("blog_posts")
        .update({
          title: patch.title,
          h1: patch.h1,
          meta_title: patch.meta_title,
          meta_description: patch.meta_description,
          content_json: patch.content_json,
          reading_time_minutes: patch.reading_time_minutes,
        })
        .eq("id", row.id)
        .eq("status", "draft");

      if (upErr) {
        console.error("boost failed", row.slug, upErr.message);
        skipped += 1;
      } else {
        boosted += 1;
        console.log("boosted", row.slug);
      }
    } finally {
      await sleep(50);
    }
  }

  console.log(JSON.stringify({ dryRun, boosted, skipped, limit }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
