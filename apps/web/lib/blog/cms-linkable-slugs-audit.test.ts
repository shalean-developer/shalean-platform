import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLUSTER_GUIDE_INTENT_SLUGS } from "@/lib/blog/cluster-guide-intent-labels";
import { GOVERNED_SEED_SLUG_SEMANTIC_CLUSTER } from "@/lib/blog/import/governed-seed-markdown-to-content-json";
import { SEO_TRAFFIC_BLOG_POSTS } from "@/lib/blog/seed/seoTrafficBlogPosts";
import { isRoutableBlogSlug } from "@/lib/blog/validBlogRoutes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedDir = path.join(__dirname, "seed");

function collectRelatedSlugsFromGovernedSeedJson(): string[] {
  const out: string[] = [];
  if (!fs.existsSync(seedDir)) return out;
  for (const file of fs.readdirSync(seedDir)) {
    if (!file.startsWith("draft-") || !file.endsWith(".json")) continue;
    const raw = JSON.parse(fs.readFileSync(path.join(seedDir, file), "utf8")) as {
      slug?: string;
      related_articles?: { slug?: string }[];
    };
    if (raw.slug) out.push(raw.slug);
    for (const rel of raw.related_articles ?? []) {
      if (rel.slug) out.push(rel.slug);
    }
  }
  return out;
}

describe("CMS linkable slug audit", () => {
  it("every cluster intent override slug is routable", () => {
    const missing = CLUSTER_GUIDE_INTENT_SLUGS.filter((slug) => !isRoutableBlogSlug(slug, { dbPublishedSlugs: new Set() }));
    expect(missing, `Add to CMS_LINKABLE pools: ${missing.join(", ")}`).toEqual([]);
  });

  it("every governed seed slug is routable", () => {
    const slugs = Object.keys(GOVERNED_SEED_SLUG_SEMANTIC_CLUSTER);
    const missing = slugs.filter((slug) => !isRoutableBlogSlug(slug, { dbPublishedSlugs: new Set() }));
    expect(missing).toEqual([]);
  });

  it("every SEO traffic seed slug is routable", () => {
    const missing = SEO_TRAFFIC_BLOG_POSTS.map((p) => p.slug).filter(
      (slug) => !isRoutableBlogSlug(slug, { dbPublishedSlugs: new Set() }),
    );
    expect(missing).toEqual([]);
  });

  it("every governed seed related_article slug is routable", () => {
    const related = collectRelatedSlugsFromGovernedSeedJson();
    const missing = [...new Set(related)].filter((slug) => !isRoutableBlogSlug(slug, { dbPublishedSlugs: new Set() }));
    expect(missing, `Fix link pools for: ${missing.join(", ")}`).toEqual([]);
  });

  it("accepts common HC override slugs used in cluster drafts", () => {
    for (const slug of [
      "how-often-deep-clean-home-cape-town",
      "what-does-professional-cleaner-do-cape-town",
      "how-often-book-home-cleaning-cape-town",
    ]) {
      expect(isRoutableBlogSlug(slug, { dbPublishedSlugs: new Set() })).toBe(true);
    }
  });
});
