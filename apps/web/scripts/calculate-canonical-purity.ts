/**
 * Static canonical purity & route hygiene metrics over repo sources (no HTTP).
 * Skips `programmaticBlogCleanupRedirects.ts` (same rationale as `audit-internal-links`).
 *
 * `npm run report:canonical-purity`
 *
 * Optional JSON path: `CANONICAL_PURITY_JSON=out/canonical-purity.json npm run report:canonical-purity`
 */

import { mkdirSync, writeFileSync } from "fs";
import { dirname } from "path";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";
import {
  DEV_BLOG_STATIC_LINK_ALLOWLIST,
  isRedirectAliasBlogSlug,
  normalizeBlogHref,
} from "../lib/blog/validBlogRoutes";

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
      if (e.name === "programmaticBlogCleanupRedirects.ts") continue;
      if (!/\.test\.(ts|tsx)$/i.test(e.name)) yield p;
    }
  }
}

function extractBlogPaths(source: string): string[] {
  const out: string[] = [];
  const re = /(?<![a-z0-9])\/blog\/[a-z0-9]+(?:-[a-z0-9]+)*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    out.push(m[0]);
  }
  return out;
}

function main(): void {
  let totalInternalBlogLinks = 0;
  let strictCanonicalMatches = 0;
  let normalizedDeltaCount = 0;
  let redirectAliasOccurrences = 0;
  let outsideStaticAllowlist = 0;

  for (const file of walk(ROOT)) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const paths = extractBlogPaths(text);
    const seenLocal = new Set<string>();
    for (const path of paths) {
      if (seenLocal.has(path)) continue;
      seenLocal.add(path);
      const slug = path.replace(/^\/blog\//, "").replace(/\/$/, "");
      if (!slug) continue;
      totalInternalBlogLinks += 1;

      if (isRedirectAliasBlogSlug(slug)) {
        redirectAliasOccurrences += 1;
        continue;
      }

      const norm = normalizeBlogHref(path);
      const pathBase = path.split(/[?#]/)[0] ?? path;
      const normBase = norm.split(/[?#]/)[0] ?? norm;
      if (normBase !== pathBase) {
        normalizedDeltaCount += 1;
      } else {
        strictCanonicalMatches += 1;
      }

      if (!DEV_BLOG_STATIC_LINK_ALLOWLIST.has(slug)) {
        outsideStaticAllowlist += 1;
      }
    }
  }

  const purityDen = Math.max(1, totalInternalBlogLinks);
  const redirectHopReliancePct =
    Math.round(((normalizedDeltaCount + redirectAliasOccurrences) / purityDen) * 10_000) / 100;
  const canonicalPurityPct = Math.round((strictCanonicalMatches / purityDen) * 10_000) / 100;
  const routeHygieneScore = Math.max(0, Math.min(100, Math.round(canonicalPurityPct)));
  const sitemapIntegrityScore = redirectAliasOccurrences === 0 ? 100 : Math.max(0, 100 - redirectAliasOccurrences * 3);

  const report = {
    generatedAt: new Date().toISOString(),
    totals: {
      totalInternalBlogLinks,
      strictCanonicalMatches,
      normalizedLinks: normalizedDeltaCount,
      redirectAliasOccurrences,
      internalBlogLinksOutsideStaticAllowlist: outsideStaticAllowlist,
      redirectHopReliancePercent: redirectHopReliancePct,
    },
    scores: {
      canonicalPurityPercent: canonicalPurityPct,
      routeHygieneScore,
      sitemapIntegrityScore,
    },
    notes: [
      "strictCanonicalMatches counts /blog paths equal to normalizeBlogHref (pathname) and not REDIRECT_ALIAS.",
      "internalBlogLinksOutsideStaticAllowlist includes CMS-only slugs — informational, not errors.",
    ],
  };

  const jsonPath = process.env.CANONICAL_PURITY_JSON?.trim();
  if (jsonPath) {
    mkdirSync(dirname(jsonPath), { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`Wrote ${jsonPath}`);
  }

  console.log("=== Canonical purity report (static) ===\n");
  console.log(JSON.stringify(report, null, 2));
}

main();
