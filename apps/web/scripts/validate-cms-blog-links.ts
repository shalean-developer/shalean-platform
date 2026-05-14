/**
 * CI / local: scan published `blog_posts` for dead internal `/blog/*` links in content_json, canonical_url, overrides.
 *
 * Run: `npx tsx scripts/validate-cms-blog-links.ts`
 * Optional: `--json=reports/cms-blog-links.json` `--csv=reports/cms-blog-links.csv`
 *
 * Requires: `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SERVICE_KEY`) + `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`).
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { safeParseBlogContentJson } from "../lib/blog/content-json-schema";
import type { BlogContentJson } from "../lib/blog/content-json";
import {
  fetchPublishedBlogSlugSet,
  validateCmsBlogDocument,
  type BrokenCmsBlogLink,
} from "../lib/blog/cms-blog-link-validation";
import { getSupabaseAdmin } from "../lib/supabase/admin";

function parseArgs(argv: string[]): { jsonOut?: string; csvOut?: string } {
  const out: { jsonOut?: string; csvOut?: string } = {};
  for (const a of argv) {
    if (a.startsWith("--json=")) out.jsonOut = a.slice("--json=".length);
    else if (a.startsWith("--csv=")) out.csvOut = a.slice("--csv=".length);
  }
  return out;
}

function toCsv(rows: BrokenCmsBlogLink[]): string {
  const header = [
    "sourcePostSlug",
    "fieldPath",
    "brokenHref",
    "normalizedSlug",
    "issueType",
    "recommendedFix",
  ];
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push(
      [r.sourcePostSlug, r.fieldPath, r.brokenHref, r.normalizedSlug, r.issueType, r.recommendedFix]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const { jsonOut, csvOut } = parseArgs(process.argv.slice(2));
  const admin = getSupabaseAdmin();
  if (!admin) {
    console.warn(
      "[validate-cms-blog-links] SKIP: Supabase admin not configured. Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY to scan published posts in CI.",
    );
    return;
  }

  const publishedSet = await fetchPublishedBlogSlugSet(admin);
  const { data, error } = await admin
    .from("blog_posts")
    .select("slug,canonical_url,related_guide_override_slugs,content_json")
    .eq("status", "published")
    .lte("published_at", new Date().toISOString())
    .not("content_json", "is", null);

  if (error || !data) {
    console.error("[validate-cms-blog-links] Query failed:", error?.message ?? "no data");
    process.exitCode = 2;
    return;
  }

  const allBroken: BrokenCmsBlogLink[] = [];
  const parseFailures: { slug: string; message: string }[] = [];

  for (const raw of data as Record<string, unknown>[]) {
    const slug = String(raw.slug ?? "").trim();
    if (!slug) continue;
    const parsed = safeParseBlogContentJson(raw.content_json);
    if (!parsed.success) {
      parseFailures.push({ slug, message: parsed.error.message });
      continue;
    }
    const content = parsed.data as BlogContentJson;
    const overrides = Array.isArray(raw.related_guide_override_slugs)
      ? (raw.related_guide_override_slugs as unknown[]).map((x) => String(x))
      : null;
    const broken = validateCmsBlogDocument(
      {
        slug,
        content,
        canonical_url: raw.canonical_url == null ? null : String(raw.canonical_url),
        related_guide_override_slugs: overrides,
      },
      publishedSet,
    );
    allBroken.push(...broken);
  }

  console.log("=== CMS internal /blog/* link validation ===\n");
  console.log(`Published posts scanned: ${data.length}`);
  console.log(`Parse failures: ${parseFailures.length}`);
  if (parseFailures.length) {
    for (const p of parseFailures.slice(0, 20)) {
      console.log(`  ${p.slug}: ${p.message}`);
    }
    if (parseFailures.length > 20) console.log(`  … ${parseFailures.length - 20} more`);
  }
  console.log(`Broken internal blog links: ${allBroken.length}\n`);

  if (allBroken.length) {
    console.table(
      allBroken.map((b) => ({
        source: b.sourcePostSlug,
        field: b.fieldPath,
        href: b.brokenHref.length > 56 ? `${b.brokenHref.slice(0, 53)}…` : b.brokenHref,
        issue: b.issueType,
      })),
    );
  }

  if (jsonOut) {
    mkdirSync(dirname(jsonOut), { recursive: true });
    writeFileSync(jsonOut, JSON.stringify({ broken: allBroken, parseFailures }, null, 2), "utf8");
    console.log(`\nWrote JSON: ${jsonOut}`);
  }
  if (csvOut) {
    mkdirSync(dirname(csvOut), { recursive: true });
    writeFileSync(csvOut, toCsv(allBroken), "utf8");
    console.log(`Wrote CSV: ${csvOut}`);
  }

  if (allBroken.length || parseFailures.length) {
    process.exitCode = 1;
  }
}

void main();
