/**
 * Import governed seed JSON drafts into `blog_posts` as status=draft (no publish).
 *
 *   cd apps/web && npx tsx scripts/import-governed-blog-seed-drafts.ts
 *   cd apps/web && npx tsx scripts/import-governed-blog-seed-drafts.ts --dry-run
 */

import "./load-apps-web-env";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

import { assignStableBlogBlockIds } from "@/lib/blog/assign-stable-block-ids";
import { warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown } from "@/lib/blog/cluster-related-guides-legacy-markdown-guard";
import { blogContentJsonSchema } from "@/lib/blog/content-json-schema";
import type { BlogContentJson } from "@/lib/blog/content-json";
import { computeReadingTimeMinutes } from "@/lib/blog/compute-reading-time";
import { normalizeManualRelatedGuideSlugs } from "@/lib/blog/fetch-cluster-related-guides";
import {
  buildGovernedSeedContentJson,
  resolveGovernedSeedSemanticCluster,
  type GovernedSeedInternalLink,
} from "@/lib/blog/import/governed-seed-markdown-to-content-json";
import { injectInternalLinks } from "@/lib/blog/seo/inject-internal-links";
import { buildInjectInternalLinksContext } from "@/lib/blog/seo/build-internal-link-context";
import { parseSeoInternalLinkContext } from "@/lib/blog/seo/seo-internal-link-context-schema";
import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";
import { normalizeSemanticClusterInput } from "@/lib/seo/blogGovernance";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const dryRun = process.argv.includes("--dry-run");

const SEED_FILES = [
  "draft-deep-vs-standard-which-to-book-cape-town.json",
  "draft-same-day-cleaning-cape-town.json",
  "draft-whats-included-deep-cleaning-cape-town.json",
  "draft-how-long-does-house-cleaning-take-cape-town.json",
  "draft-once-off-vs-recurring-cleaning-cape-town.json",
  "draft-how-to-prepare-home-before-cleaner-arrives-cape-town.json",
  "draft-what-professional-cleaners-can-and-cannot-do-cape-town.json",
  "draft-why-home-still-feels-dirty-after-cleaning-cape-town.json",
  "draft-move-out-cleaning-checklist-cape-town-tenants.json",
  "draft-how-often-should-you-deep-clean-your-home-cape-town.json",
] as const;

const relatedArticleSchema = z.object({ title: z.string().optional(), slug: z.string().optional() }).passthrough();

const governedSeedSchema = z
  .object({
    title: z.string().min(1),
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
    content_markdown: z.string().min(1),
    meta_title: z.string().min(1),
    meta_description: z.string().min(1),
    excerpt: z.string().nullable().optional(),
    canonical_url: z.string().nullable().optional(),
    h1: z.string().nullable().optional(),
    faq_schema_json: z.unknown().optional(),
    blogposting_schema_json: z
      .object({
        keywords: z.array(z.string()).optional(),
      })
      .passthrough()
      .optional(),
    internal_links: z
      .array(z.object({ url: z.string(), anchor_text: z.string() }))
      .optional(),
    related_articles: z.array(relatedArticleSchema).optional(),
    semantic_cluster: z.string().nullable().optional(),
    notes_for_editor: z.string().nullable().optional(),
  })
  .passthrough();

const seedDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lib", "blog", "seed");

function normalizeEmpty(s?: string | null): string | null {
  if (s == null) return null;
  const t = String(s).trim();
  return t === "" ? null : t;
}

async function syncPostTags(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, postId: string, tagIds: string[]) {
  await admin.from("blog_post_tags").delete().eq("post_id", postId);
  if (tagIds.length === 0) return;
  const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
  const { error } = await admin.from("blog_post_tags").insert(rows);
  if (error) throw new Error(error.message);
}

/** Creates taxonomy rows expected by cluster governance (idempotent). */
async function ensureClusterTaxonomyTags(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const { error } = await admin.from("blog_tags").upsert(
    [
      { slug: "cluster-1", name: "Cluster 1 — service selection" },
      { slug: "cluster-2", name: "Cluster 2 — booking confidence" },
    ],
    { onConflict: "slug" },
  );
  if (error) throw new Error(`blog_tags upsert: ${error.message}`);
}

async function main() {
  const warnings: string[] = [];
  const failures: string[] = [];
  let imported = 0;
  let skipped = 0;

  const admin = dryRun ? null : getSupabaseAdmin();
  if (!dryRun && !admin) {
    console.error("Missing Supabase admin client (service role env).");
    process.exitCode = 1;
    return;
  }

  let cluster1Id: string | null = null;
  let cluster2Id: string | null = null;
  if (admin) {
    try {
      await ensureClusterTaxonomyTags(admin);
    } catch (e) {
      console.error(e instanceof Error ? e.message : e);
      process.exitCode = 1;
      return;
    }
    const { data: tags, error: tagErr } = await admin.from("blog_tags").select("id,slug").in("slug", ["cluster-1", "cluster-2"]);
    if (tagErr) {
      console.error("Failed to load cluster tags:", tagErr.message);
      process.exitCode = 1;
      return;
    }
    for (const row of tags ?? []) {
      const r = row as { id?: string; slug?: string };
      if (r.slug === "cluster-1" && r.id) cluster1Id = r.id;
      if (r.slug === "cluster-2" && r.id) cluster2Id = r.id;
    }
    if (!cluster1Id) warnings.push("blog_tags: cluster-1 still missing after upsert.");
    if (!cluster2Id) warnings.push("blog_tags: cluster-2 still missing after upsert.");
  }

  for (const fileName of SEED_FILES) {
    const filePath = path.join(seedDir, fileName);
    let rawText: string;
    try {
      rawText = fs.readFileSync(filePath, "utf8");
    } catch {
      failures.push(`${fileName}: read error`);
      continue;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawText);
    } catch {
      failures.push(`${fileName}: invalid JSON`);
      continue;
    }

    const zRes = governedSeedSchema.safeParse(parsedJson);
    if (!zRes.success) {
      failures.push(`${fileName}: schema ${zRes.error.message}`);
      continue;
    }
    const seed = zRes.data;

    const built = buildGovernedSeedContentJson({
      content_markdown: seed.content_markdown,
      faq_schema_json: seed.faq_schema_json,
      internal_links: (seed.internal_links ?? []) as GovernedSeedInternalLink[],
    });
    if (!built.ok) {
      failures.push(`${fileName}: ${built.error}`);
      continue;
    }

    let content: BlogContentJson = assignStableBlogBlockIds(built.content);
    const schemaCheck = blogContentJsonSchema.safeParse(content);
    if (!schemaCheck.success) {
      failures.push(`${fileName}: content_json ${schemaCheck.error.message}`);
      continue;
    }
    content = schemaCheck.data;

    warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(content, {
      slug: seed.slug,
      source: "import_governed_blog_seed_drafts",
    });

    try {
      const stored = parseSeoInternalLinkContext(null);
      const ctx = buildInjectInternalLinksContext({
        slug: seed.slug,
        stored,
        primaryKeyword: null,
        relatedBlogPosts: [],
      });
      content = injectInternalLinks(content, ctx);
    } catch {
      /* keep pre-inject content */
    }

    const reading_time_minutes = computeReadingTimeMinutes(content);

    const rawCluster = resolveGovernedSeedSemanticCluster(seed.slug, {
      explicit: seed.semantic_cluster,
      notes_for_editor: seed.notes_for_editor,
    });
    const semantic_cluster = normalizeSemanticClusterInput(rawCluster);

    const relatedSlugs = (seed.related_articles ?? [])
      .map((r) => (typeof r.slug === "string" ? r.slug.trim().toLowerCase() : ""))
      .filter(Boolean);
    const related_guide_override_slugs = normalizeManualRelatedGuideSlugs(relatedSlugs, 8);

    const keywords = seed.blogposting_schema_json?.keywords?.filter((k) => k.trim()) ?? [];
    const secondary_keywords = keywords.length ? keywords.slice(0, 20) : null;

    const tagIds: string[] = [];
    if (semantic_cluster === "service-selection" && cluster1Id) tagIds.push(cluster1Id);
    if (semantic_cluster === "booking-confidence" && cluster2Id) tagIds.push(cluster2Id);

    const row = {
      slug: seed.slug,
      title: seed.title.trim(),
      h1: normalizeEmpty(seed.h1 ?? null),
      excerpt: normalizeEmpty(seed.excerpt ?? null) ?? normalizeEmpty(seed.meta_description)?.slice(0, 320) ?? "",
      status: "draft" as const,
      source: "editorial" as const,
      published_at: null as string | null,
      meta_title: normalizeEmpty(seed.meta_title),
      meta_description: normalizeEmpty(seed.meta_description),
      canonical_url: normalizeEmpty(seed.canonical_url) ?? `/blog/${seed.slug}`,
      featured_image_url: resolveBlogFeaturedSrc(seed.slug, null),
      featured_image_alt: resolveBlogFeaturedAlt(seed.slug, null),
      noindex: false,
      content_json: content,
      reading_time_minutes,
      primary_keyword: null as string | null,
      secondary_keywords,
      search_intent: "informational" as const,
      seo_internal_link_context: null as Record<string, unknown> | null,
      category_id: null as string | null,
      semantic_cluster,
      related_guide_override_slugs,
    };

    if (dryRun) {
      imported++;
      console.log(`[dry-run] OK ${seed.slug} — blocks=${content.blocks.length} cluster=${semantic_cluster ?? "null"}`);
      continue;
    }

    if (!admin) continue;

    const { data: bySlug } = await admin.from("blog_posts").select("id,slug,title").eq("slug", seed.slug).maybeSingle();
    if (bySlug?.id) {
      warnings.push(`SKIP duplicate slug: ${seed.slug} (existing id ${bySlug.id})`);
      skipped++;
      continue;
    }

    const { data: byTitle } = await admin.from("blog_posts").select("id,slug,title").eq("title", row.title).maybeSingle();
    if (byTitle?.id) {
      warnings.push(`SKIP duplicate title: "${row.title}" (existing slug ${(byTitle as { slug?: string }).slug})`);
      skipped++;
      continue;
    }

    const { data: inserted, error } = await admin.from("blog_posts").insert(row).select("id,slug").single();
    if (error) {
      failures.push(`${fileName}: insert ${error.message}`);
      continue;
    }
    const postId = (inserted as { id?: string })?.id;
    if (postId && tagIds.length) {
      try {
        await syncPostTags(admin, postId, tagIds);
      } catch (e) {
        failures.push(`${fileName}: tags ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    }
    imported++;
    console.log(`Imported draft: ${seed.slug}`);
  }

  if (admin && !dryRun) {
    for (const fileName of SEED_FILES) {
      const filePath = path.join(seedDir, fileName);
      let raw: unknown;
      try {
        raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      } catch {
        continue;
      }
      const zr = governedSeedSchema.safeParse(raw);
      if (!zr.success) continue;
      const seed = zr.data;
      const rawCluster = resolveGovernedSeedSemanticCluster(seed.slug, {
        explicit: seed.semantic_cluster,
        notes_for_editor: seed.notes_for_editor,
      });
      const semantic_cluster = normalizeSemanticClusterInput(rawCluster);
      const tagIds: string[] = [];
      if (semantic_cluster === "service-selection" && cluster1Id) tagIds.push(cluster1Id);
      if (semantic_cluster === "booking-confidence" && cluster2Id) tagIds.push(cluster2Id);
      if (tagIds.length === 0) continue;
      const { data: post } = await admin.from("blog_posts").select("id").eq("slug", seed.slug).maybeSingle();
      const pid = (post as { id?: string } | null)?.id;
      if (!pid) continue;
      try {
        await syncPostTags(admin, pid, tagIds);
      } catch {
        /* non-fatal */
      }
    }
  }

  console.log("\n--- Summary ---");
  console.log(`Imported: ${imported}`);
  console.log(`Skipped:  ${skipped}`);
  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(`  · ${w}`);
  }
  if (failures.length) {
    console.log("\nFailed:");
    for (const f of failures) console.log(`  · ${f}`);
    process.exitCode = 1;
  }
}

main();
