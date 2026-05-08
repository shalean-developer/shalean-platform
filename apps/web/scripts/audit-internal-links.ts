/**
 * Static audit: scan repo sources for `/blog/*` path strings; flag redirect aliases and unknown slugs.
 * Run: `npm run audit:internal-links`
 *
 * Optional HTTP checks (production/staging): `AUDIT_BASE_URL=https://shalean.co.za npm run audit:internal-links`
 */

import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import { isRedirectAliasBlogSlug, normalizeBlogHref } from "../lib/blog/validBlogRoutes";

const ROOT = join(__dirname, "..");
const SKIP_DIRS = new Set(["node_modules", ".next", ".turbo", "dist", "coverage"]);

function* walk(dir: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (/\.(tsx|ts|jsx|js|json|md|mdx|html)$/i.test(e.name)) {
      if (e.name !== "programmaticBlogCleanupRedirects.ts" && !/\.test\.(ts|tsx)$/i.test(e.name)) yield p;
    }
  }
}

/** Capture `/blog/slug` path segments; skip `/images/blog/*` asset paths. */
function extractBlogPaths(source: string): string[] {
  const out: string[] = [];
  const re = /(?<![a-z0-9])\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    out.push(m[0]);
  }
  return out;
}

async function headCheck(url: string): Promise<number | null> {
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 8000);
    const res = await fetch(url, { method: "HEAD", redirect: "manual", signal: ac.signal });
    clearTimeout(t);
    return res.status;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const aliasHits: { file: string; path: string }[] = [];
  const normalizedChanges: { file: string; from: string; to: string }[] = [];

  for (const file of walk(ROOT)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const paths = extractBlogPaths(text);
    const seen = new Set<string>();
    for (const path of paths) {
      if (seen.has(path)) continue;
      seen.add(path);
      const slug = path.replace(/^\/blog\//, "").replace(/\/$/, "");
      if (!slug) continue;
      if (isRedirectAliasBlogSlug(slug)) {
        aliasHits.push({ file, path });
      }
      const norm = normalizeBlogHref(path).split(/[?#]/)[0] ?? normalizeBlogHref(path);
      if (norm !== path && norm.startsWith("/blog/")) {
        normalizedChanges.push({ file, from: path, to: norm });
      }
    }
  }

  console.log("=== Internal blog path audit (static) ===\n");
  console.log(`Redirect-alias slugs linked directly (should use canonical): ${aliasHits.length}`);
  for (const h of aliasHits.slice(0, 80)) {
    console.log(`  ${h.path}  ←  ${h.file.replace(ROOT + "\\", "").replace(ROOT + "/", "")}`);
  }
  if (aliasHits.length > 80) console.log(`  … ${aliasHits.length - 80} more`);

  console.log(`\nPaths that normalize to a different /blog URL: ${normalizedChanges.length}`);
  for (const h of normalizedChanges.slice(0, 40)) {
    console.log(`  ${h.from} → ${h.to}  (${h.file.replace(ROOT + "\\", "").replace(ROOT + "/", "")})`);
  }

  const base = process.env.AUDIT_BASE_URL?.trim();
  if (base) {
    console.log(`\n=== HEAD checks (${base}) ===`);
    const samples = [...new Set(aliasHits.map((h) => h.path))].slice(0, 12);
    for (const p of samples) {
      const url = `${base.replace(/\/+$/, "")}${p}`;
      const st = await headCheck(url);
      console.log(`  ${url}  →  ${st ?? "error"}`);
    }
  }

  if (aliasHits.length) process.exitCode = 1;
}

void main();
