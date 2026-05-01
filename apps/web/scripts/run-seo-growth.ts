/**
 * Monthly-style SEO growth: gaps → priority queue → programmatic drafts.
 *
 *   cd apps/web && npx tsx scripts/run-seo-growth.ts [--dry-run] [--batch=35] [--min=20] [--max=50]
 */

import { createClient } from "@supabase/supabase-js";
import { generateProgrammaticPost } from "../lib/blog/generators/generate-programmatic-post";
import { saveProgrammaticPost } from "../lib/blog/generators/save-programmatic-post";
import { enqueueTopics, takeTopTopics } from "../lib/seo/content-queue";
import { buildProgrammaticTopicMatrix, findMatrixContentGaps } from "../lib/seo/find-content-gaps";
import { generateKeywordVariations } from "../lib/seo/keyword-expansion";

const dryRun = process.argv.includes("--dry-run");

function parseEqArg(name: string, fallback: number): number {
  const raw = process.argv.find((a) => a.startsWith(`${name}=`));
  if (!raw) return fallback;
  const n = Number.parseInt(raw.slice(name.length + 1), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
  if (!dryRun && (!url?.trim() || !key?.trim())) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const minBatch = parseEqArg("--min", 20);
  const maxBatch = parseEqArg("--max", 50);
  const batch = Math.min(maxBatch, Math.max(minBatch, parseEqArg("--batch", 35)));

  let existingSlugs: string[] = [];
  let related: { slug: string; title: string }[] = [];

  if (url?.trim() && key?.trim()) {
    const admin = createClient(url, key, { auth: { persistSession: false } });
    const { data: slugsData } = await admin.from("blog_posts").select("slug");
    existingSlugs =
      (slugsData as { slug?: string }[] | null)?.flatMap((r) => (r.slug ? [r.slug] : [])) ?? [];

    if (!dryRun) {
      const { data: rel } = await admin
        .from("blog_posts")
        .select("slug,title")
        .eq("status", "published")
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(50);
      related =
        (rel as { slug?: string; title?: string }[] | null)?.flatMap((r) =>
          r.slug && r.title ? [{ slug: r.slug, title: r.title }] : [],
        ) ?? [];
    }
  }

  const matrix = buildProgrammaticTopicMatrix();
  const missing = findMatrixContentGaps(existingSlugs, matrix);

  const variationHints = new Map<string, string[]>();
  for (const t of missing) {
    const base = `${t.serviceName} ${t.locationName} ${t.cityName}`;
    variationHints.set(t.suggestedSlug, generateKeywordVariations(base));
  }

  const queued = enqueueTopics(missing, variationHints);
  const top = takeTopTopics(queued, batch);

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  if (!dryRun) {
    if (!url?.trim() || !key?.trim()) {
      console.error("Missing Supabase env for write mode.");
      process.exit(1);
    }
    const admin = createClient(url, key, { auth: { persistSession: false } });
    for (const item of top) {
      const post = generateProgrammaticPost({
        location: item.locationName,
        city: item.cityName,
        service: item.serviceName,
        locationSlug: item.locationSlug,
        citySlug: item.citySlug,
        serviceSlug: item.serviceSlug,
        relatedBlogPosts: related,
      });

      const res = await saveProgrammaticPost(post);
      if (res.ok) {
        if (res.action === "update") updated += 1;
        else created += 1;
      } else if (res.reason === "slug_exists") {
        skipped += 1;
      } else {
        failed += 1;
        console.error("fail", post.slug, res.reason, res.message);
      }
      await sleep(50);
    }
  } else {
    for (const item of top) {
      console.log("[dry-run]", item.suggestedSlug, item.priority, item.score);
    }
    created = top.length;
  }

  console.log(
    JSON.stringify({
      dryRun,
      batch,
      missingMatrix: missing.length,
      planned: top.length,
      created,
      updated,
      skipped,
      failed,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
