import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBlogDraftPreviewQuery, buildBlogPostViewPath } from "@/lib/blog/build-blog-post-view-url";

describe("buildBlogPostViewPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns published path without preview", () => {
    expect(buildBlogPostViewPath("my-post", "published")).toBe("/blog/my-post");
  });

  it("appends dev preview query for drafts", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildBlogPostViewPath("my-post", "draft")).toBe("/blog/my-post?preview=true");
  });

  it("uses provided draft preview query", () => {
    expect(buildBlogPostViewPath("my-post", "scheduled", "?preview=secret")).toBe("/blog/my-post?preview=secret");
  });
});

describe("buildBlogDraftPreviewQuery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns preview=true in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildBlogDraftPreviewQuery()).toBe("?preview=true");
  });
});
