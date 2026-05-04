/**
 * Validates featured-image assets used by `BLOG_IMAGE_MAP` and optional Supabase-published posts.
 *
 * Usage (from apps/web):
 *   npx tsx scripts/validate-blog-images.ts
 *
 * Checks:
 * - Local files exist under `public/` for mapped paths
 * - Duplicate paths in `BLOG_IMAGE_MAP` (same file assigned to multiple slugs)
 * - Published DB slugs not in `BLOG_IMAGE_MAP` with empty `featured_image_url` (would use default only)
 *
 * Optional: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (via `.env.local`).
 */

import "./load-apps-web-env.ts";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { BLOG_IMAGE_MAP, DEFAULT_BLOG_FEATURED_IMAGE } from "../lib/blogImageMap";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, "..");
const publicRoot = path.join(appRoot, "public");

function isRemotePath(p: string): boolean {
  return p.startsWith("http://") || p.startsWith("https://");
}

function publicFileExists(webPath: string): boolean {
  if (isRemotePath(webPath)) return true;
  const rel = webPath.startsWith("/") ? webPath.slice(1) : webPath;
  return fs.existsSync(path.join(publicRoot, rel));
}

async function run(): Promise<void> {
  const pathsInMap = new Set<string>([...Object.values(BLOG_IMAGE_MAP), DEFAULT_BLOG_FEATURED_IMAGE]);
  const missing: string[] = [];
  for (const webPath of pathsInMap) {
    if (isRemotePath(webPath)) continue;
    if (!publicFileExists(webPath)) missing.push(webPath);
  }

  const byPath = new Map<string, string[]>();
  for (const [slug, imgPath] of Object.entries(BLOG_IMAGE_MAP)) {
    if (!byPath.has(imgPath)) byPath.set(imgPath, []);
    byPath.get(imgPath)!.push(slug);
  }
  const duplicateAssignments = [...byPath.entries()].filter(([, slugs]) => slugs.length > 1);

  console.log("[validate-blog-images] Mapped slugs:", Object.keys(BLOG_IMAGE_MAP).length);
  console.log("[validate-blog-images] Unique asset paths in map:", byPath.size);

  if (missing.length > 0) {
    console.error("[validate-blog-images] Missing files under public/:");
    for (const m of missing.sort()) console.error("  ", m);
  } else {
    console.log("[validate-blog-images] All mapped local paths exist under public/");
  }

  if (duplicateAssignments.length > 0) {
    console.warn(
      `[validate-blog-images] ${duplicateAssignments.length} image paths are shared by multiple slugs (expected when slug count exceeds unique pool).`,
    );
    const sample = duplicateAssignments.slice(0, 8);
    for (const [img, slugs] of sample) {
      console.warn(`  ${img} ← ${slugs.length} slugs (e.g. ${slugs.slice(0, 3).join(", ")}${slugs.length > 3 ? "…" : ""})`);
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("[validate-blog-images] Skip DB check (no NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
    process.exitCode = missing.length > 0 ? 1 : 0;
    return;
  }

  const supabase = createClient(url, key);
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("blog_posts")
    .select("slug,featured_image_url")
    .eq("status", "published")
    .lte("published_at", nowIso);

  if (error) {
    console.error("[validate-blog-images] Supabase:", error.message);
    process.exitCode = 1;
    return;
  }

  const unmappedNoCms: string[] = [];
  for (const row of data ?? []) {
    const r = row as { slug?: string; featured_image_url?: string | null };
    const slug = String(r.slug ?? "").trim();
    if (!slug) continue;
    const hasMap = Object.prototype.hasOwnProperty.call(BLOG_IMAGE_MAP, slug);
    const cms = r.featured_image_url != null && String(r.featured_image_url).trim() !== "";
    if (!hasMap && !cms) unmappedNoCms.push(slug);
  }

  if (unmappedNoCms.length > 0) {
    console.warn(
      `[validate-blog-images] ${unmappedNoCms.length} published DB slug(s) not in BLOG_IMAGE_MAP and no CMS featured image (fallback: default marketing hero):`,
    );
    for (const s of unmappedNoCms.sort()) console.warn("  ", s);
  } else {
    console.log("[validate-blog-images] No published DB rows need map+CMS attention.");
  }

  process.exitCode = missing.length > 0 ? 1 : 0;
}

run().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
