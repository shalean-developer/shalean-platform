/**
 * Upsert in-repo PROGRAMMATIC_POSTS definitions into `blog_posts` (draft or published).
 *
 * Usage (from apps/web):
 *   npx tsx scripts/migrate-programmatic-posts-to-supabase.ts --dry-run
 *   npx tsx scripts/migrate-programmatic-posts-to-supabase.ts --publish
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL).
 */

import { createClient } from "@supabase/supabase-js";
import { computeReadingTimeMinutes } from "../lib/blog/compute-reading-time";
import {
  PROGRAMMATIC_POSTS,
  programmaticServiceLabel,
  type ProgrammaticPost,
} from "../lib/blog/programmaticPosts";
import { generateProgrammaticPost } from "../lib/blog/generators/generate-programmatic-post";
import { slugifyTitle } from "../lib/blog/slugify-title";

const dryRun = process.argv.includes("--dry-run");
const publish = process.argv.includes("--publish");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

function serviceSlugFromProgrammatic(service: ProgrammaticPost["service"]): string {
  switch (service) {
    case "deep":
      return "deep-cleaning";
    case "standard":
      return "standard-cleaning";
    case "airbnb":
      return "airbnb-cleaning";
    case "move-out":
      return "move-out-cleaning";
    case "carpet":
      return "carpet-cleaning";
  }
}

function buildInput(p: ProgrammaticPost) {
  const location = p.location ?? "Cape Town";
  const city = "Cape Town";
  const serviceLabel =
    p.service === "deep"
      ? "Deep cleaning"
      : p.service === "standard"
        ? "Standard cleaning"
        : p.service === "airbnb"
          ? "Airbnb cleaning"
          : p.service === "move-out"
            ? "Move-out cleaning"
            : "Carpet cleaning";

  return {
    location,
    city,
    service: serviceLabel,
    locationSlug: slugifyTitle(location),
    citySlug: "cape-town",
    serviceSlug: serviceSlugFromProgrammatic(p.service),
  };
}

async function main() {
  if (!url?.trim() || !key?.trim()) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  let ok = 0;
  let fail = 0;

  for (const p of PROGRAMMATIC_POSTS) {
    const gen = generateProgrammaticPost(buildInput(p));
    const reading_time_minutes = computeReadingTimeMinutes(gen.content_json);

    const row = {
      slug: p.slug,
      title: p.title,
      h1: p.h1,
      excerpt: gen.excerpt,
      meta_title: gen.meta_title,
      meta_description: gen.meta_description,
      content_json: gen.content_json,
      reading_time_minutes,
      status: publish ? ("published" as const) : ("draft" as const),
      source: "programmatic" as const,
      published_at: publish ? p.publishedAt : null,
      noindex: false,
      primary_keyword: p.primaryKeyword,
      secondary_keywords: [
        `${programmaticServiceLabel(p.service)} ${p.location ?? "Cape Town"}`,
        "Shalean Cape Town",
      ],
      search_intent: "transactional",
    };

    if (dryRun) {
      console.log("[dry-run]", row.slug);
      ok += 1;
      continue;
    }

    const { error } = await admin.from("blog_posts").upsert(row, { onConflict: "slug" });
    if (error) {
      console.error("fail", p.slug, error.message);
      fail += 1;
    } else {
      console.log("upsert", p.slug);
      ok += 1;
    }
  }

  console.log(JSON.stringify({ dryRun, publish, ok, fail, total: PROGRAMMATIC_POSTS.length }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
