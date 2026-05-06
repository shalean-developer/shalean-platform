/**
 * Warn-only: governed draft JSON in `lib/blog/seed` should not embed the legacy
 * in-body "## Related guides (Shalean cluster)" block (footer is canonical).
 *
 * From apps/web:
 *   npx tsx scripts/check-governed-blog-seed-markdown-cluster-section.ts
 */

import fs from "node:fs";
import path from "node:path";

import { warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown } from "@/lib/blog/cluster-related-guides-legacy-markdown-guard";

const seedDir = path.join(process.cwd(), "lib", "blog", "seed");

function main() {
  if (!fs.existsSync(seedDir)) {
    console.error("Seed dir not found:", seedDir);
    process.exitCode = 1;
    return;
  }
  const files = fs.readdirSync(seedDir).filter((f) => f.endsWith(".json"));
  for (const file of files) {
    const fp = path.join(seedDir, file);
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(fp, "utf8")) as Record<string, unknown>;
    } catch {
      console.error("Invalid JSON:", fp);
      process.exitCode = 1;
      return;
    }
    const slug = typeof (raw as { slug?: unknown }).slug === "string" ? String((raw as { slug: string }).slug) : file;
    const md = (raw as { content_markdown?: unknown }).content_markdown;
    if (typeof md === "string") {
      warnIfSerializedBlogBodyContainsLegacyManualClusterRelatedGuidesMarkdown(md, {
        slug,
        source: `seed_json:${file}`,
      });
    }
  }
  console.log("Checked", files.length, "JSON file(s) in", seedDir);
}

main();
