import { describe, expect, it } from "vitest";
import type { ClusterPeerPost } from "@/lib/blog/seo/blog-cluster-collision";
import { mergeClusterRelatedGuides } from "./fetch-cluster-related-guides";

describe("mergeClusterRelatedGuides", () => {
  const peers: ClusterPeerPost[] = [
    { slug: "b-post", title: "B", primary_keyword: null, published_at: "2025-01-02T00:00:00.000Z" },
    { slug: "a-post", title: "A", primary_keyword: null, published_at: "2025-01-03T00:00:00.000Z" },
  ];

  it("puts overrides first in order, then peers, dedupes, excludes self, caps", () => {
    const overridePosts = new Map([
      ["a-post", { slug: "a-post", title: "A pinned" }],
      ["orphan", { slug: "orphan", title: "O" }],
    ]);
    const out = mergeClusterRelatedGuides({
      currentSlug: "self",
      orderedOverrideSlugs: ["a-post", "orphan", "a-post"],
      overridePosts,
      peersSorted: peers,
      max: 3,
    });
    expect(out.map((x) => x.slug)).toEqual(["a-post", "orphan", "b-post"]);
    expect(out[0]?.title).toBe("A pinned");
  });

  it("skips missing override rows and self slug", () => {
    const out = mergeClusterRelatedGuides({
      currentSlug: "b-post",
      orderedOverrideSlugs: ["missing", "b-post"],
      overridePosts: new Map(),
      peersSorted: peers,
      max: 5,
    });
    expect(out.map((x) => x.slug)).toEqual(["a-post"]);
  });
});
