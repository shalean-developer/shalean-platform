/**
 * MKT-001E decision-engine unit tests (DQ, alerts, SLIs, explainability).
 */

import { describe, expect, it } from "vitest";
import {
  aggregateCampaignIntel,
  buildDailyTrends,
  computeOperationalRates,
  isStaleConnection,
} from "@/lib/promotions/publishIntelligence";
import { INTEL_THRESHOLDS } from "@/lib/promotions/publishIntelligenceCatalog";
import {
  buildOperationalAlerts,
  buildOperationalRecommendations,
  buildServiceLevelIndicators,
  computeLatencyStats,
  evaluateDataQualityIssues,
  formatPct,
  percentile,
} from "@/lib/promotions/publishIntelligenceDecision";

describe("MKT-001E computeOperationalRates", () => {
  it("computes success and failure from history counts", () => {
    const rates = computeOperationalRates({
      published: 8,
      failed: 2,
      retryable: 1,
      succeededJobs: 8,
      totalJobsInWindow: 10,
    });
    expect(rates.publishSuccessRate).toBeCloseTo(0.8);
    expect(rates.failureRate).toBeCloseTo(0.2);
    expect(rates.retryRate).toBeCloseTo(0.1);
  });

  it("returns null rates when denominator is zero", () => {
    const rates = computeOperationalRates({
      published: 0,
      failed: 0,
      retryable: 0,
      succeededJobs: 0,
      totalJobsInWindow: 0,
    });
    expect(rates.publishSuccessRate).toBeNull();
    expect(rates.failureRate).toBeNull();
    expect(rates.retryRate).toBeNull();
  });
});

describe("MKT-001E latency / percentiles", () => {
  it("computes median and p95", () => {
    const values = [100, 200, 300, 400, 1000];
    expect(percentile(values, 50)).toBe(300);
    expect(percentile(values, 95)).toBe(1000);
    const stats = computeLatencyStats(values);
    expect(stats.medianMs).toBe(300);
    expect(stats.p95Ms).toBe(1000);
    expect(stats.sampleSize).toBe(5);
  });
});

describe("MKT-001E isStaleConnection", () => {
  const now = Date.parse("2026-07-17T12:00:00.000Z");

  it("marks connected accounts without recent activity as stale", () => {
    expect(
      isStaleConnection({
        status: "connected",
        health: "healthy",
        lastSync: "2026-06-01T00:00:00.000Z",
        lastPublishAt: null,
        nowMs: now,
      }),
    ).toBe(true);
  });

  it("does not mark fresh connections stale", () => {
    expect(
      isStaleConnection({
        status: "connected",
        health: "healthy",
        lastSync: "2026-07-16T00:00:00.000Z",
        lastPublishAt: "2026-07-17T10:00:00.000Z",
        nowMs: now,
      }),
    ).toBe(false);
  });
});

describe("MKT-001E aggregateCampaignIntel / trends", () => {
  it("ranks successful and failing campaigns", () => {
    const rows = [
      { campaign_name: "Spring", promotion_id: "p1", status: "published", provider: "facebook" },
      { campaign_name: "Spring", promotion_id: "p1", status: "published", provider: "facebook" },
      { campaign_name: "Spring", promotion_id: "p1", status: "published", provider: "google_business" },
      { campaign_name: "Broken", promotion_id: "p2", status: "failed", provider: "facebook" },
      { campaign_name: "Broken", promotion_id: "p2", status: "failed", provider: "facebook" },
      { campaign_name: "Broken", promotion_id: "p2", status: "failed", provider: "facebook" },
      { campaign_name: "Broken", promotion_id: "p2", status: "published", provider: "facebook" },
    ];
    const result = aggregateCampaignIntel(rows);
    expect(result.mostSuccessful[0]?.campaignName).toBe("Spring");
    expect(result.repeatedFailures[0]?.campaignName).toBe("Broken");
  });

  it("fills day buckets", () => {
    const now = Date.parse("2026-07-17T12:00:00.000Z");
    const trends = buildDailyTrends(
      [
        { created_at: "2026-07-17T01:00:00.000Z", status: "published" },
        { created_at: "2026-07-17T02:00:00.000Z", status: "failed" },
      ],
      2,
      now,
    );
    expect(trends).toHaveLength(2);
    expect(trends.find((t) => t.day === "2026-07-17")?.published).toBe(1);
  });
});

describe("MKT-001E data quality", () => {
  it("surfaces issues instead of silencing them", () => {
    const issues = evaluateDataQualityIssues({
      detectedAt: "2026-07-17T12:00:00.000Z",
      missingHistoryCount: 2,
      orphanedJobCount: 1,
      invalidStateCount: 1,
      missingProviderMappingCount: 0,
      duplicateIdempotencyCount: 1,
      inconsistentTimestampCount: 0,
      invalidCapabilityProviders: ["instagram"],
    });
    expect(issues.some((i) => i.code === "missing_publish_history")).toBe(true);
    expect(issues.some((i) => i.code === "orphaned_queue_job")).toBe(true);
    expect(issues.some((i) => i.code === "invalid_job_state")).toBe(true);
    expect(issues.some((i) => i.code === "duplicate_idempotency")).toBe(true);
    expect(issues.some((i) => i.code === "invalid_provider_capability")).toBe(true);
    for (const issue of issues) {
      expect(issue.why.length).toBeGreaterThan(10);
      expect(issue.triggeredBy.length).toBeGreaterThan(0);
      expect(issue.runbookHref).toBeTruthy();
      expect(issue.action.length).toBeGreaterThan(5);
    }
  });

  it("emits nothing when clean", () => {
    expect(
      evaluateDataQualityIssues({
        detectedAt: "2026-07-17T12:00:00.000Z",
        missingHistoryCount: 0,
        orphanedJobCount: 0,
        invalidStateCount: 0,
        missingProviderMappingCount: 0,
        duplicateIdempotencyCount: 0,
        inconsistentTimestampCount: 0,
        invalidCapabilityProviders: [],
      }),
    ).toEqual([]);
  });
});

describe("MKT-001E alerts", () => {
  const base = {
    detectedAt: "2026-07-17T12:00:00.000Z",
    publishSuccessRate: 0.95,
    published: 95,
    failed: 5,
    retryBacklog: 0,
    dlqCount: 0,
    dlqGrowth24h: 0,
    oldestQueuedJobAgeMs: null as number | null,
    queueDepth: 0,
    workerStatus: "succeeded" as const,
    workerLastSuccessAt: "2026-07-17T11:00:00.000Z",
    providers: [] as Array<{
      provider: string;
      authFailures: number;
      attempts: number;
      connectionHealth: string | null;
      connectionStatus: string | null;
      unexpectedDisabled: boolean;
    }>,
  };

  it("emits no alerts when healthy", () => {
    expect(buildOperationalAlerts(base)).toEqual([]);
  });

  it("alerts on auth failure rate with explainability", () => {
    const alerts = buildOperationalAlerts({
      ...base,
      providers: [
        {
          provider: "facebook",
          authFailures: 12,
          attempts: 85,
          connectionHealth: "error",
          connectionStatus: "error",
          unexpectedDisabled: false,
        },
      ],
    });
    const auth = alerts.find((a) => a.code === "provider_auth_failures");
    expect(auth).toBeTruthy();
    expect(auth?.why).toContain("facebook");
    expect(auth?.why).toContain(formatPct(12 / 85));
    expect(auth?.triggeredBy).toContain("authFailures");
    expect(auth?.runbookId).toBe("reconnect_provider");
    expect(auth?.evidence.authFailures).toBe(12);
  });

  it("alerts when cron worker stale with queue work", () => {
    const alerts = buildOperationalAlerts({
      ...base,
      queueDepth: 4,
      retryBacklog: 2,
      workerStatus: "stale",
      workerLastSuccessAt: "2026-07-16T10:00:00.000Z",
    });
    const cron = alerts.find((a) => a.code === "cron_worker_not_running");
    expect(cron?.severity).toBe("critical");
  });

  it("alerts on DLQ growth spike only above threshold", () => {
    expect(
      buildOperationalAlerts({ ...base, dlqCount: 0, dlqGrowth24h: 0 }).find(
        (a) => a.code === "dlq_growth_spike",
      ),
    ).toBeUndefined();
    expect(
      buildOperationalAlerts({
        ...base,
        dlqCount: INTEL_THRESHOLDS.dlqCountWarn,
        dlqGrowth24h: 1,
      }).find((a) => a.code === "dlq_growth_spike"),
    ).toBeTruthy();
  });
});

describe("MKT-001E recommendations", () => {
  it("includes why/metrics/evidence/action/runbook", () => {
    const recs = buildOperationalRecommendations({
      detectedAt: "2026-07-17T12:00:00.000Z",
      publishSuccessRate: 0.5,
      failureRate: 0.5,
      published: 5,
      failed: 5,
      retryBacklog: 8,
      dlqCount: 2,
      dlqGrowth24h: 2,
      stuckLedgerProcessing: 1,
      oldestQueuedJobAgeMs: 40 * 60 * 1000,
      oldestQueuedJobAt: "2026-07-17T11:20:00.000Z",
      queueDepth: 9,
      providers: [
        {
          provider: "google_business",
          authFailures: 4,
          rateLimitFailures: 0,
          attempts: 10,
          connectionHealth: "error",
          connectionStatus: "error",
          stale: false,
          lastSync: null,
          lastPublishAt: null,
        },
      ],
      repeatedFailures: [
        {
          campaignName: "Broken",
          published: 1,
          failed: 5,
          successRate: 1 / 6,
        },
      ],
      dataQualityCount: 2,
    });
    expect(recs.length).toBeGreaterThan(3);
    for (const rec of recs) {
      expect(rec.kind).toBe("recommendation");
      expect(rec.why.length).toBeGreaterThan(10);
      expect(rec.triggeredBy.length).toBeGreaterThan(0);
      expect(rec.action.length).toBeGreaterThan(5);
      expect(rec.runbookHref).toBeTruthy();
      expect(Object.keys(rec.evidence).length).toBeGreaterThan(0);
    }
  });

  it("emits nothing when healthy and no DQ", () => {
    expect(
      buildOperationalRecommendations({
        detectedAt: "2026-07-17T12:00:00.000Z",
        publishSuccessRate: 0.99,
        failureRate: 0.01,
        published: 99,
        failed: 1,
        retryBacklog: 0,
        dlqCount: 0,
        dlqGrowth24h: 0,
        stuckLedgerProcessing: 0,
        oldestQueuedJobAgeMs: null,
        oldestQueuedJobAt: null,
        queueDepth: 0,
        providers: [
          {
            provider: "facebook",
            authFailures: 0,
            rateLimitFailures: 0,
            attempts: 10,
            connectionHealth: "healthy",
            connectionStatus: "connected",
            stale: false,
            lastSync: "2026-07-17T10:00:00.000Z",
            lastPublishAt: "2026-07-17T11:00:00.000Z",
          },
        ],
        repeatedFailures: [],
        dataQualityCount: 0,
      }),
    ).toEqual([]);
  });
});

describe("MKT-001E SLIs", () => {
  it("marks met/miss against targets", () => {
    const slis = buildServiceLevelIndicators({
      publishSuccessRate: 0.99,
      medianLatencyMs: 1000,
      p95LatencyMs: 5000,
      oldestQueuedJobAgeMs: 1000,
      retrySuccessRate: 0.9,
      recoveryTimeMs: 2000,
    });
    expect(slis.every((s) => s.met === true)).toBe(true);

    const miss = buildServiceLevelIndicators({
      publishSuccessRate: 0.5,
      medianLatencyMs: 100_000,
      p95LatencyMs: 200_000,
      oldestQueuedJobAgeMs: 900_000,
      retrySuccessRate: 0.1,
      recoveryTimeMs: 900_000,
    });
    expect(miss.every((s) => s.met === false)).toBe(true);
  });
});
