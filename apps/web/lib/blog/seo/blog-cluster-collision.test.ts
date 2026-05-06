import { describe, expect, it } from "vitest";
import {
  collectClusterSemanticOverlapWarnings,
  OVERLAP_SIGNAL_INTENT_PHRASE_SHARED,
  OVERLAP_SIGNAL_PRIMARY_KEYWORD_MULTISET,
  OVERLAP_SIGNAL_SLUG_TOKEN_JACCARD,
  OVERLAP_SIGNAL_TITLE_TOKEN_JACCARD,
} from "@/lib/blog/seo/blog-cluster-collision";
import { validateBlogPublish } from "@/lib/blog/seo/publish-validation";
import { BLOG_CONTENT_JSON_SCHEMA_VERSION } from "@/lib/blog/content-json";
import type { BlogContentJson } from "@/lib/blog/content-json";
import { WARN_SEMANTIC_OVERLAP_CLUSTER } from "@/lib/seo/blogGovernance";

describe("collectClusterSemanticOverlapWarnings", () => {
  it("flags reversed comparison slugs as high overlap", () => {
    const w = collectClusterSemanticOverlapWarnings({
      slug: "deep-vs-standard-cleaning-which-to-book-cape-town",
      title: "Deep Cleaning vs Standard Cleaning in Cape Town",
      primary_keyword: null,
      semanticClusterLabel: "service-selection",
      peers: [
        {
          slug: "standard-vs-deep-cleaning-cape-town",
          title: "Standard vs Deep Cleaning in Cape Town",
          primary_keyword: null,
        },
      ],
    });
    expect(w.length).toBeGreaterThan(0);
    expect(w[0]?.code).toBe(WARN_SEMANTIC_OVERLAP_CLUSTER);
    expect(w[0]?.confidence).toBe("high");
    expect(w[0]?.relatedSlug).toBe("standard-vs-deep-cleaning-cape-town");
    expect(w[0]?.matchedSignals).toContain(OVERLAP_SIGNAL_SLUG_TOKEN_JACCARD);
    expect(w[0]?.matchedSignals).toContain(OVERLAP_SIGNAL_TITLE_TOKEN_JACCARD);
  });

  it("flags reordered primary keyword as high overlap", () => {
    const w = collectClusterSemanticOverlapWarnings({
      slug: "same-day-cleaning-cape-town",
      title: "Same-Day Cleaning in Cape Town",
      primary_keyword: "same day cleaning cape town",
      semanticClusterLabel: "booking-confidence",
      peers: [
        {
          slug: "same-day-cleaning-guide",
          title: "When Same-Day Cleaning Works",
          primary_keyword: "cape town same day cleaning",
        },
      ],
    });
    const hit = w.find((x) => x.confidence === "high");
    expect(hit).toBeTruthy();
    expect(hit?.matchedSignals).toContain(OVERLAP_SIGNAL_PRIMARY_KEYWORD_MULTISET);
  });

  it("records intent phrase when both titles share a signal", () => {
    const w = collectClusterSemanticOverlapWarnings({
      slug: "how-long-does-house-cleaning-take",
      title: "How Long Does House Cleaning Take in Cape Town?",
      primary_keyword: null,
      semanticClusterLabel: "booking-confidence",
      peers: [
        {
          slug: "how-long-cleaning-takes-guide",
          title: "How Long Does Cleaning Take — Cape Town Reality Check",
          primary_keyword: null,
        },
      ],
    });
    const hit = w.find((x) => x.matchedSignals?.includes(OVERLAP_SIGNAL_INTENT_PHRASE_SHARED));
    expect(hit).toBeTruthy();
    expect(hit?.matchedSignals).toContain(OVERLAP_SIGNAL_TITLE_TOKEN_JACCARD);
  });
});

describe("validateBlogPublish + cluster peers", () => {
  const minimalPublishedContent = (): BlogContentJson => ({
    schema_version: BLOG_CONTENT_JSON_SCHEMA_VERSION,
    blocks: [
      { type: "section", title: "Body", content: "word ".repeat(850), heading_level: 2 },
      { type: "faq", items: [{ question: "Q?", answer: "A.".repeat(50) }] },
      { type: "cta", title: "Book", description: "d", button_text: "Go", link: "/booking" },
      {
        type: "internal_links",
        title: "More",
        links: [{ label: "svc", url: "/services/standard-cleaning-cape-town" }],
      },
    ],
  });

  it("adds overlap warnings when peers and cluster scope are present", () => {
    const r = validateBlogPublish(minimalPublishedContent(), {
      tags: ["cluster-2"],
      slug: "prepare-home-test",
      title: "How to Prepare Your Home Before a Cleaner Arrives",
      primaryKeyword: "prepare home before cleaner",
      clusterPeers: [
        {
          slug: "how-to-prepare-home-before-cleaner-arrives-cape-town",
          title: "How to Prepare Your Home Before a Cleaner Arrives (Cape Town Guide)",
          primary_keyword: "prepare home before cleaner cape town",
        },
      ],
    });
    const ow = r.warnings.find((w) => w.code === WARN_SEMANTIC_OVERLAP_CLUSTER);
    expect(ow).toBeTruthy();
    expect(ow?.matchedSignals?.length).toBeGreaterThan(0);
  });
});
