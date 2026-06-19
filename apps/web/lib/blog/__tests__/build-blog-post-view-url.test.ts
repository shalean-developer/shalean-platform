import { afterEach, describe, expect, it } from "vitest";
import { buildBlogDraftPreviewQuery, buildBlogPostViewPath } from "@/lib/blog/build-blog-post-view-url";

describe("buildBlogPostViewPath", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalToken = process.env.BLOG_DRAFT_PREVIEW_TOKEN;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.BLOG_DRAFT_PREVIEW_TOKEN = originalToken;
  });

  it("returns published path without preview", () => {
    expect(buildBlogPostViewPath("my-post", "published")).toBe("/blog/my-post");
  });

  it("appends dev preview query for drafts", () => {
    process.env.NODE_ENV = "development";
    expect(buildBlogPostViewPath("my-post", "draft")).toBe("/blog/my-post?preview=true");
  });

  it("uses provided draft preview query", () => {
    expect(buildBlogPostViewPath("my-post", "scheduled", "?preview=secret")).toBe("/blog/my-post?preview=secret");
  });
});

describe("buildBlogDraftPreviewQuery", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("returns preview=true in development", () => {
    process.env.NODE_ENV = "development";
    expect(buildBlogDraftPreviewQuery()).toBe("?preview=true");
  });
});
