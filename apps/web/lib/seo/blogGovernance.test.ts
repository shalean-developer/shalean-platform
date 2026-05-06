import { describe, expect, it } from "vitest";
import {
  normalizeSemanticClusterInput,
  resolveSemanticClusterKey,
  SEMANTIC_CLUSTER_BOOKING_CONFIDENCE,
  SEMANTIC_CLUSTER_SERVICE_SELECTION,
} from "@/lib/seo/blogGovernance";

describe("normalizeSemanticClusterInput", () => {
  it("accepts allowed keys only", () => {
    expect(normalizeSemanticClusterInput("booking-confidence")).toBe(SEMANTIC_CLUSTER_BOOKING_CONFIDENCE);
    expect(normalizeSemanticClusterInput("  BOOKING-CONFIDENCE  ")).toBe(SEMANTIC_CLUSTER_BOOKING_CONFIDENCE);
    expect(normalizeSemanticClusterInput("not-a-real-cluster")).toBeNull();
    expect(normalizeSemanticClusterInput("")).toBeNull();
  });
});

describe("resolveSemanticClusterKey", () => {
  it("prefers persisted over tags", () => {
    expect(
      resolveSemanticClusterKey({
        persisted: SEMANTIC_CLUSTER_SERVICE_SELECTION,
        tags: ["cluster-2"],
      }),
    ).toBe(SEMANTIC_CLUSTER_SERVICE_SELECTION);
  });

  it("falls back to cluster-* tags when unset", () => {
    expect(
      resolveSemanticClusterKey({
        persisted: null,
        tags: ["cluster-2", "cape-town"],
      }),
    ).toBe(SEMANTIC_CLUSTER_BOOKING_CONFIDENCE);
    expect(
      resolveSemanticClusterKey({
        persisted: "",
        tags: ["cluster-1"],
      }),
    ).toBe(SEMANTIC_CLUSTER_SERVICE_SELECTION);
  });
});
