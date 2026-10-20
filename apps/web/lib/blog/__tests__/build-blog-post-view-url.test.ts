import { afterEach, describe, expect, it, vi } from "vitest";
import { buildBlogDraftPreviewQuery, buildBlogPostViewPath } from "@/lib/blog/build-blog-post-view-url";

describe("buildBlogPostViewPath", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns published path without preview", () => {
    expect(buildBlogPostViewPath("my-post", "published")).toBe("/blog/my-post");
  });

  it("requires a server-minted preview even in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildBlogPostViewPath("my-post", "draft")).toBeNull();
  });

  it("uses provided draft preview query", () => {
    expect(buildBlogPostViewPath("my-post", "scheduled", "?preview=secret")).toBe("/blog/my-post?preview=secret");
  });
});

describe("buildBlogDraftPreviewQuery", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does not expose a global preview token", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(buildBlogDraftPreviewQuery()).toBeNull();
  });
});
