import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  join(process.cwd(), "lib/blog/get-post-by-slug.ts"),
  "utf8",
);

describe("QUOTA-01 public blog cache", () => {
  it("caches anonymous published blog reads for five minutes", () => {
    expect(source).toContain('unstable_cache');
    expect(source).toContain('["published-blog-post-by-slug-v1"]');
    expect(source).toContain('revalidate: 300');
    expect(source).toContain('tags: ["blog-public"]');
  });

  it("keeps preview-token reads uncached", () => {
    expect(source).toContain('opts?.previewToken');
    expect(source).toContain('await loadPostBySlug(trimmed, opts)');
    expect(source).toContain('await loadPublishedPostBySlugCached(trimmed)');
  });
});
