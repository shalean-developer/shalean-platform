import { describe, expect, it } from "vitest";
import type { SeoOptimizationEngineResult } from "@/lib/seo/optimization/engine";
import { normalizeRecommendationsForDataReadiness } from "@/lib/seo/optimization/persist";

function resultWithReadiness(scrollReady: boolean, ctaReady: boolean): SeoOptimizationEngineResult {
  return {
    titleAutoCandidates: [],
    hubUiPatches: [],
    pageHealth: [
      {
        slug: "wynberg-cleaning-services",
        score: 6,
        band: "critical",
        components: { ctr: 6.1, scroll: 0, cta: 0 },
        data_gaps: {
          scroll_sessions_at_25: scrollReady ? 20 : 4,
          scroll_sessions_needed: 20,
          scroll_ready: scrollReady,
          cta_sessions: ctaReady ? 10 : 0,
          cta_sessions_needed: 10,
          cta_ready: ctaReady,
          gsc_impressions: 196,
          ctr_pct: 1.02,
          ctr_target_pct: 3,
          avg_position: 13.6,
          missing_signals: [
            ...(scrollReady ? [] : ["Need 16 more scroll sessions (25% depth)"]),
            ...(ctaReady ? [] : ["Need 10 more CTA click sessions"]),
            "Raise CTR toward 3% for position #13.6",
          ],
        },
        winning_title_variant: null,
        best_cta_key: null,
      },
    ],
    recommendations: [
      {
        slug: "wynberg-cleaning-services",
        kind: "page_health",
        severity: "critical",
        title: "Page health · critical (6)",
        detail: { score: 6, band: "critical", ctr_component: 6.1, scroll_component: 0, cta_component: 0 },
        confidence: 0.858,
      },
      {
        slug: "wynberg-cleaning-services",
        kind: "trust_signals",
        severity: "warn",
        title: "Add stronger trust signals",
        detail: { score: 6, band: "critical" },
        confidence: 0.55,
      },
    ],
  };
}

describe("normalizeRecommendationsForDataReadiness", () => {
  it("does not persist missing engagement samples as critical SEO failures", () => {
    const normalized = normalizeRecommendationsForDataReadiness(resultWithReadiness(false, false));

    expect(normalized.some((row) => row.kind === "trust_signals")).toBe(false);
    expect(normalized.some((row) => row.kind === "data_gaps")).toBe(true);

    const pageHealth = normalized.find((row) => row.kind === "page_health");
    expect(pageHealth?.severity).toBe("info");
    expect(pageHealth?.title).toContain("gathering data");
    expect(pageHealth?.detail.band).toBe("insufficient_data");
  });

  it("keeps measured page-health failures but suppresses trust work already implemented by the shared template", () => {
    const normalized = normalizeRecommendationsForDataReadiness(resultWithReadiness(true, true));

    expect(normalized.find((row) => row.kind === "page_health")?.severity).toBe("critical");
    expect(normalized.some((row) => row.kind === "trust_signals")).toBe(false);
    expect(normalized.some((row) => row.kind === "data_gaps")).toBe(false);
  });
});
