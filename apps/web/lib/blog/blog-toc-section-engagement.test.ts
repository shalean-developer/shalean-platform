import { describe, expect, it } from "vitest";
import {
  buildBlogTocCtaEngagementSnapshot,
  completionBucketFromScrollPct,
} from "./blog-toc-section-engagement";

describe("completionBucketFromScrollPct", () => {
  it("maps bands", () => {
    expect(completionBucketFromScrollPct(0)).toBe("lt_25");
    expect(completionBucketFromScrollPct(24)).toBe("lt_25");
    expect(completionBucketFromScrollPct(25)).toBe("25_49");
    expect(completionBucketFromScrollPct(74)).toBe("50_74");
    expect(completionBucketFromScrollPct(99)).toBe("75_99");
    expect(completionBucketFromScrollPct(100)).toBe("100");
  });
});

describe("buildBlogTocCtaEngagementSnapshot", () => {
  it("mirrors live engagement fields for CTA attribution", () => {
    const snap = buildBlogTocCtaEngagementSnapshot(
      {
        slug: "post-a",
        heading_id: "pricing",
        heading_label: "Pricing",
        heading_depth: 2,
        startedAt: 1_000,
        maxScrollPct: 62.4,
        nextSectionReached: true,
      },
      4_500,
    );
    expect(snap.last_engaged_heading_id).toBe("pricing");
    expect(snap.last_engaged_heading_label).toBe("Pricing");
    expect(snap.last_engaged_heading_depth).toBe(2);
    expect(snap.engagement_completion_bucket).toBe("50_74");
    expect(snap.engagement_max_scroll_pct).toBe(62);
    expect(snap.time_since_heading_engagement_ms).toBe(3500);
    expect(snap.heading_next_section_reached).toBe(true);
    expect(snap.heading_flush_state).toBe("active");
    expect(snap.heading_intent_type).toBe("pricing");
  });
});
