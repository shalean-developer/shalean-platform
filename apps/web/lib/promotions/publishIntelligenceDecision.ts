/**
 * MKT-001E — Deterministic decision engine (DQ, alerts, recommendations, SLIs).
 * Pure functions — unit-tested without DB.
 */

import {
  INTEL_RUNBOOKS,
  INTEL_THRESHOLDS,
  INTELLIGENCE_SEVERITY_RANK,
  type IntelligenceRunbookId,
  type IntelligenceSeverity,
} from "@/lib/promotions/publishIntelligenceCatalog";

export type DecisionEvidence = Record<string, number | string | boolean | null>;

export type ExplainableFinding = {
  id: string;
  severity: IntelligenceSeverity;
  title: string;
  /** Why is this being shown? */
  why: string;
  /** Which metric ids triggered it? */
  triggeredBy: string[];
  /** Supporting observable values. */
  evidence: DecisionEvidence;
  /** What action should an administrator take? */
  action: string;
  runbookId: IntelligenceRunbookId;
  runbookHref: string;
  href?: string;
  detectedAt: string;
};

export type DataQualityIssue = ExplainableFinding & {
  kind: "data_quality";
  code:
    | "missing_publish_history"
    | "orphaned_queue_job"
    | "invalid_job_state"
    | "missing_provider_mapping"
    | "duplicate_idempotency"
    | "inconsistent_timestamps"
    | "invalid_provider_capability";
};

export type OperationalAlert = ExplainableFinding & {
  kind: "alert";
  code:
    | "publish_success_below_threshold"
    | "retry_backlog_exceeded"
    | "dlq_growth_spike"
    | "provider_auth_failures"
    | "queue_processing_stalled"
    | "cron_worker_not_running"
    | "provider_disabled_unexpectedly";
};

export type OperationalRecommendation = ExplainableFinding & {
  kind: "recommendation";
};

export type ServiceLevelIndicator = {
  id: string;
  name: string;
  value: number | null;
  target: number;
  unit: "ratio" | "ms";
  met: boolean | null;
  description: string;
};

export type LatencyStats = {
  sampleSize: number;
  avgMs: number | null;
  medianMs: number | null;
  p95Ms: number | null;
};

export function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/** Nearest-rank percentile on a copy (does not mutate input). */
export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  const idx = Math.min(sorted.length - 1, Math.max(0, rank - 1));
  return sorted[idx] ?? null;
}

export function computeLatencyStats(latenciesMs: number[]): LatencyStats {
  return {
    sampleSize: latenciesMs.length,
    avgMs: avg(latenciesMs),
    medianMs: percentile(latenciesMs, 50),
    p95Ms: percentile(latenciesMs, 95),
  };
}

function withRunbook(
  runbookId: IntelligenceRunbookId,
  base: Omit<ExplainableFinding, "runbookId" | "runbookHref">,
): ExplainableFinding {
  const rb = INTEL_RUNBOOKS[runbookId];
  return {
    ...base,
    runbookId,
    runbookHref: rb.href,
    href: base.href ?? rb.href,
  };
}

function sortFindings<T extends { severity: IntelligenceSeverity; id: string }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      INTELLIGENCE_SEVERITY_RANK[a.severity] - INTELLIGENCE_SEVERITY_RANK[b.severity] ||
      a.id.localeCompare(b.id),
  );
}

export function formatPct(ratio: number | null | undefined, digits = 0): string {
  if (ratio == null || Number.isNaN(ratio)) return "n/a";
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function buildServiceLevelIndicators(input: {
  publishSuccessRate: number | null;
  medianLatencyMs: number | null;
  p95LatencyMs: number | null;
  oldestQueuedJobAgeMs: number | null;
  retrySuccessRate: number | null;
  recoveryTimeMs: number | null;
}): ServiceLevelIndicator[] {
  const t = INTEL_THRESHOLDS.sli;
  const metRatio = (value: number | null, target: number) =>
    value == null ? null : value >= target;
  const metLatency = (value: number | null, target: number) =>
    value == null ? null : value <= target;

  return [
    {
      id: "sli_publish_success",
      name: "Publish success %",
      value: input.publishSuccessRate,
      target: t.publishSuccessTarget,
      unit: "ratio",
      met: metRatio(input.publishSuccessRate, t.publishSuccessTarget),
      description: `Target ≥ ${formatPct(t.publishSuccessTarget)}`,
    },
    {
      id: "sli_median_latency",
      name: "Median publish latency",
      value: input.medianLatencyMs,
      target: t.medianLatencyTargetMs,
      unit: "ms",
      met: metLatency(input.medianLatencyMs, t.medianLatencyTargetMs),
      description: `Target ≤ ${t.medianLatencyTargetMs} ms`,
    },
    {
      id: "sli_p95_latency",
      name: "95th percentile publish latency",
      value: input.p95LatencyMs,
      target: t.p95LatencyTargetMs,
      unit: "ms",
      met: metLatency(input.p95LatencyMs, t.p95LatencyTargetMs),
      description: `Target ≤ ${t.p95LatencyTargetMs} ms`,
    },
    {
      id: "sli_queue_processing",
      name: "Queue processing time",
      value: input.oldestQueuedJobAgeMs,
      target: t.queueProcessingTargetMs,
      unit: "ms",
      met: metLatency(input.oldestQueuedJobAgeMs, t.queueProcessingTargetMs),
      description: `Oldest active job age target ≤ ${t.queueProcessingTargetMs} ms`,
    },
    {
      id: "sli_retry_success",
      name: "Retry success rate",
      value: input.retrySuccessRate,
      target: t.retrySuccessTarget,
      unit: "ratio",
      met: metRatio(input.retrySuccessRate, t.retrySuccessTarget),
      description: `Target ≥ ${formatPct(t.retrySuccessTarget)}`,
    },
    {
      id: "sli_recovery_time",
      name: "Recovery time from provider failures",
      value: input.recoveryTimeMs,
      target: t.queueProcessingTargetMs,
      unit: "ms",
      met: metLatency(input.recoveryTimeMs, t.queueProcessingTargetMs),
      description:
        "Median created_at → processed_at for jobs that succeeded after attempts > 1",
    },
  ];
}

export function evaluateDataQualityIssues(input: {
  detectedAt: string;
  missingHistoryCount: number;
  orphanedJobCount: number;
  invalidStateCount: number;
  missingProviderMappingCount: number;
  duplicateIdempotencyCount: number;
  inconsistentTimestampCount: number;
  invalidCapabilityProviders: string[];
}): DataQualityIssue[] {
  const out: DataQualityIssue[] = [];

  if (input.missingHistoryCount >= INTEL_THRESHOLDS.missingHistoryWarn) {
    const finding = withRunbook("inspect_data_quality", {
      id: "dq_missing_publish_history",
      severity: "warning",
      title: "Succeeded jobs missing publish history",
      why: "Jobs marked succeeded should leave an audit row in social_publish_history. Gaps mean reports under-count published posts.",
      triggeredBy: ["missingHistoryCount"],
      evidence: { missingHistoryCount: input.missingHistoryCount },
      action: "Inspect recent succeeded jobs without history; verify history write path in executePublishJob.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "data_quality", code: "missing_publish_history" });
  }

  if (input.orphanedJobCount > 0) {
    const finding = withRunbook("inspect_data_quality", {
      id: "dq_orphaned_queue_jobs",
      severity: "warning",
      title: "Orphaned queue jobs detected",
      why: "Active queue jobs reference a promotion_id that no longer exists (or is null when campaign metadata expected).",
      triggeredBy: ["orphanedJobCount"],
      evidence: { orphanedJobCount: input.orphanedJobCount },
      action: "Review orphaned jobs; cancel or complete them intentionally; fix enqueue promotion linkage.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "data_quality", code: "orphaned_queue_job" });
  }

  if (input.invalidStateCount > 0) {
    const finding = withRunbook("inspect_data_quality", {
      id: "dq_invalid_job_states",
      severity: "critical",
      title: "Jobs stuck in invalid lease/state combinations",
      why: "Leased jobs without lease metadata, or expired leases still marked leased, break the claim/recover contract.",
      triggeredBy: ["invalidStateCount"],
      evidence: { invalidStateCount: input.invalidStateCount },
      action: "Run lease recovery; if persistent, inspect claim RPCs and worker holders.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "data_quality", code: "invalid_job_state" });
  }

  if (input.missingProviderMappingCount > 0) {
    const finding = withRunbook("inspect_data_quality", {
      id: "dq_missing_provider_mapping",
      severity: "warning",
      title: "Jobs reference providers without account mapping",
      why: "Publish jobs exist for providers that have no social_accounts row, so connection health cannot be correlated.",
      triggeredBy: ["missingProviderMappingCount"],
      evidence: { missingProviderMappingCount: input.missingProviderMappingCount },
      action: "Connect the provider or cancel obsolete jobs for unused providers.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/connected-accounts",
    });
    out.push({ ...finding, kind: "data_quality", code: "missing_provider_mapping" });
  }

  if (input.duplicateIdempotencyCount > 0) {
    const finding = withRunbook("inspect_data_quality", {
      id: "dq_duplicate_idempotency",
      severity: "critical",
      title: "Duplicate idempotency key collisions detected",
      why: "Multiple active jobs share the same (provider, idempotency_key), which violates the logical dedupe contract.",
      triggeredBy: ["duplicateIdempotencyCount"],
      evidence: { duplicateIdempotencyCount: input.duplicateIdempotencyCount },
      action: "Inspect unique index social_publish_jobs_active_key_uidx and conflicting rows; cancel duplicates.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "data_quality", code: "duplicate_idempotency" });
  }

  if (input.inconsistentTimestampCount > 0) {
    const finding = withRunbook("inspect_data_quality", {
      id: "dq_inconsistent_timestamps",
      severity: "info",
      title: "Inconsistent job timestamps",
      why: "processed_at earlier than created_at (or dead_lettered_at before created_at) corrupts latency SLIs.",
      triggeredBy: ["inconsistentTimestampCount"],
      evidence: { inconsistentTimestampCount: input.inconsistentTimestampCount },
      action: "Exclude bad rows from ops triage; fix writer clock/ordering bugs if recurring.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "data_quality", code: "inconsistent_timestamps" });
  }

  if (input.invalidCapabilityProviders.length > 0) {
    const finding = withRunbook("inspect_data_quality", {
      id: "dq_invalid_provider_capability",
      severity: "warning",
      title: "Invalid provider capability configuration",
      why: "Enabled providers advertise publishEnabled=false (or stubs claim publish) — operators may misread availability.",
      triggeredBy: ["invalidCapabilityProviders"],
      evidence: {
        invalidCapabilityProviders: input.invalidCapabilityProviders.join(","),
        count: input.invalidCapabilityProviders.length,
      },
      action: "Align feature flags with adapter capabilities; keep stubs honest.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "data_quality", code: "invalid_provider_capability" });
  }

  return sortFindings(out);
}

export function buildOperationalAlerts(input: {
  detectedAt: string;
  publishSuccessRate: number | null;
  published: number;
  failed: number;
  retryBacklog: number;
  dlqCount: number;
  dlqGrowth24h: number;
  oldestQueuedJobAgeMs: number | null;
  queueDepth: number;
  workerStatus: "never_run" | "currently_running" | "succeeded" | "failed" | "stale" | "unknown";
  workerLastSuccessAt: string | null;
  providers: Array<{
    provider: string;
    authFailures: number;
    attempts: number;
    connectionHealth: string | null;
    connectionStatus: string | null;
    unexpectedDisabled: boolean;
  }>;
}): OperationalAlert[] {
  const out: OperationalAlert[] = [];
  const th = INTEL_THRESHOLDS;

  if (input.publishSuccessRate != null && input.published + input.failed > 0) {
    if (input.publishSuccessRate < th.publishSuccessRateCritical) {
      const finding = withRunbook("inspect_provider_logs", {
        id: "alert_publish_success_critical",
        severity: "critical",
        title: "Publish success rate critically low",
        why: `Publish success is ${formatPct(input.publishSuccessRate)} (${input.published}/${input.published + input.failed}) — below critical threshold ${formatPct(th.publishSuccessRateCritical)}.`,
        triggeredBy: ["publishSuccessRate", "published", "failed"],
        evidence: {
          publishSuccessRate: input.publishSuccessRate,
          published: input.published,
          failed: input.failed,
          threshold: th.publishSuccessRateCritical,
        },
        action: "Triage failure classes by provider; pause risky campaigns until root cause is fixed.",
        detectedAt: input.detectedAt,
        href: "/office/marketing/intelligence?focus=campaigns",
      });
      out.push({ ...finding, kind: "alert", code: "publish_success_below_threshold" });
    } else if (input.publishSuccessRate < th.publishSuccessRateWarn) {
      const finding = withRunbook("inspect_provider_logs", {
        id: "alert_publish_success_warn",
        severity: "warning",
        title: "Publish success rate below target",
        why: `Publish success is ${formatPct(input.publishSuccessRate)} (${input.published}/${input.published + input.failed}) — below warning threshold ${formatPct(th.publishSuccessRateWarn)}.`,
        triggeredBy: ["publishSuccessRate"],
        evidence: {
          publishSuccessRate: input.publishSuccessRate,
          published: input.published,
          failed: input.failed,
          threshold: th.publishSuccessRateWarn,
        },
        action: "Review provider and campaign failure drill-downs.",
        detectedAt: input.detectedAt,
        href: "/office/marketing/intelligence?focus=campaigns",
      });
      out.push({ ...finding, kind: "alert", code: "publish_success_below_threshold" });
    }
  }

  if (input.retryBacklog >= th.retryBacklogCritical) {
    const finding = withRunbook("verify_cron_health", {
      id: "alert_retry_backlog_critical",
      severity: "critical",
      title: "Retry backlog critically high",
      why: `Retry backlog is ${input.retryBacklog} (critical ≥ ${th.retryBacklogCritical}).`,
      triggeredBy: ["retryBacklog"],
      evidence: { retryBacklog: input.retryBacklog, threshold: th.retryBacklogCritical },
      action: "Verify worker cron, provider rate limits, and backlog age.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/intelligence?focus=queue",
    });
    out.push({ ...finding, kind: "alert", code: "retry_backlog_exceeded" });
  } else if (input.retryBacklog >= th.retryBacklogWarn) {
    const finding = withRunbook("verify_cron_health", {
      id: "alert_retry_backlog_warn",
      severity: "warning",
      title: "Retry backlog exceeds threshold",
      why: `Retry backlog is ${input.retryBacklog} (warning ≥ ${th.retryBacklogWarn}).`,
      triggeredBy: ["retryBacklog"],
      evidence: { retryBacklog: input.retryBacklog, threshold: th.retryBacklogWarn },
      action: "Monitor next worker cycle; investigate rising failure classes.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/intelligence?focus=queue",
    });
    out.push({ ...finding, kind: "alert", code: "retry_backlog_exceeded" });
  }

  if (input.dlqGrowth24h >= th.dlqGrowth24hCritical || input.dlqCount >= th.dlqCountCritical) {
    const finding = withRunbook("replay_dlq", {
      id: "alert_dlq_growth_critical",
      severity: "critical",
      title: "DLQ growth spike",
      why: `DLQ depth ${input.dlqCount}, +${input.dlqGrowth24h} in 24h (critical thresholds depth≥${th.dlqCountCritical} or growth≥${th.dlqGrowth24hCritical}).`,
      triggeredBy: ["dlqCount", "dlqGrowth24h"],
      evidence: {
        dlqCount: input.dlqCount,
        dlqGrowth24h: input.dlqGrowth24h,
        depthThreshold: th.dlqCountCritical,
        growthThreshold: th.dlqGrowth24hCritical,
      },
      action: "Inspect DLQ failure classes; fix root cause; replay selectively.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/intelligence?focus=dlq",
    });
    out.push({ ...finding, kind: "alert", code: "dlq_growth_spike" });
  } else if (input.dlqGrowth24h >= th.dlqGrowth24hWarn || input.dlqCount >= th.dlqCountWarn) {
    const finding = withRunbook("replay_dlq", {
      id: "alert_dlq_growth_warn",
      severity: "warning",
      title: "DLQ activity detected",
      why: `DLQ depth ${input.dlqCount}, +${input.dlqGrowth24h} in 24h.`,
      triggeredBy: ["dlqCount", "dlqGrowth24h"],
      evidence: { dlqCount: input.dlqCount, dlqGrowth24h: input.dlqGrowth24h },
      action: "Review dead-letter jobs before they accumulate.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/intelligence?focus=dlq",
    });
    out.push({ ...finding, kind: "alert", code: "dlq_growth_spike" });
  }

  for (const p of input.providers) {
    const authRate = rate(p.authFailures, p.attempts);
    if (
      p.authFailures >= th.authFailureCountWarn ||
      (authRate != null && authRate >= th.authFailureRateWarn && p.attempts >= 5)
    ) {
      const finding = withRunbook("reconnect_provider", {
        id: `alert_auth_${p.provider}`,
        severity: "critical",
        title: `Provider authentication failures — ${p.provider}`,
        why: `Provider '${p.provider}' experienced a ${formatPct(authRate)} authentication failure rate in the window (${p.authFailures}/${p.attempts} attempts). Reconnect the account before further publishing.`,
        triggeredBy: ["authFailures", "authFailureRate"],
        evidence: {
          provider: p.provider,
          authFailures: p.authFailures,
          attempts: p.attempts,
          authFailureRate: authRate,
          connectionHealth: p.connectionHealth,
        },
        action: "Reconnect / rotate credentials; do not schedule publishes until healthy.",
        detectedAt: input.detectedAt,
        href: "/office/marketing/connected-accounts",
      });
      out.push({ ...finding, kind: "alert", code: "provider_auth_failures" });
    }

    if (p.unexpectedDisabled) {
      const finding = withRunbook("inspect_data_quality", {
        id: `alert_provider_disabled_${p.provider}`,
        severity: "warning",
        title: `Provider disabled unexpectedly — ${p.provider}`,
        why: `Provider '${p.provider}' has recent publish activity or a connected account but the registry flag currently disables publish.`,
        triggeredBy: ["unexpectedDisabled"],
        evidence: {
          provider: p.provider,
          connectionStatus: p.connectionStatus,
          connectionHealth: p.connectionHealth,
        },
        action: "Confirm intentional flag change; re-enable if accidental.",
        detectedAt: input.detectedAt,
      });
      out.push({ ...finding, kind: "alert", code: "provider_disabled_unexpectedly" });
    }
  }

  const stalled =
    input.oldestQueuedJobAgeMs != null &&
    input.oldestQueuedJobAgeMs >= th.oldestQueuedWarnMs &&
    input.queueDepth > 0;
  if (stalled) {
    const critical =
      input.oldestQueuedJobAgeMs! >= th.oldestQueuedCriticalMs ||
      (INTEL_THRESHOLDS.queueStallWithWorkCritical &&
        (input.workerStatus === "stale" || input.workerStatus === "never_run" || input.workerStatus === "failed"));
    const finding = withRunbook("verify_cron_health", {
      id: "alert_queue_stalled",
      severity: critical ? "critical" : "warning",
      title: "Queue processing stalled",
      why: `Oldest active job age is ~${Math.round(input.oldestQueuedJobAgeMs! / 60_000)} minutes with queue depth ${input.queueDepth}; worker status=${input.workerStatus}.`,
      triggeredBy: ["oldestQueuedJobAgeMs", "queueDepth", "workerStatus"],
      evidence: {
        oldestQueuedJobAgeMs: input.oldestQueuedJobAgeMs,
        queueDepth: input.queueDepth,
        workerStatus: input.workerStatus,
        workerLastSuccessAt: input.workerLastSuccessAt,
      },
      action: "Verify process-social-publish-jobs cron and lease recovery.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/intelligence?focus=queue",
    });
    out.push({ ...finding, kind: "alert", code: "queue_processing_stalled" });
  }

  if (
    input.workerStatus === "stale" ||
    input.workerStatus === "never_run" ||
    input.workerStatus === "failed"
  ) {
    const severity: IntelligenceSeverity =
      input.queueDepth > 0 || input.retryBacklog > 0 ? "critical" : "warning";
    const finding = withRunbook("verify_cron_health", {
      id: "alert_cron_worker",
      severity,
      title: "Publish cron worker not healthy",
      why: `process-social-publish-jobs health is '${input.workerStatus}' (last success: ${input.workerLastSuccessAt ?? "never"}).`,
      triggeredBy: ["workerStatus", "workerLastSuccessAt"],
      evidence: {
        workerStatus: input.workerStatus,
        workerLastSuccessAt: input.workerLastSuccessAt,
        queueDepth: input.queueDepth,
        staleAfterMinutes: th.publishWorkerStaleAfterMinutes,
      },
      action: "Confirm CRON_SECRET, pg_cron/Vercel schedules, and recent cron_runs success rows.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/intelligence?focus=queue",
    });
    out.push({ ...finding, kind: "alert", code: "cron_worker_not_running" });
  }

  return sortFindings(out);
}

export function buildOperationalRecommendations(input: {
  detectedAt: string;
  publishSuccessRate: number | null;
  failureRate: number | null;
  published: number;
  failed: number;
  retryBacklog: number;
  dlqCount: number;
  dlqGrowth24h: number;
  stuckLedgerProcessing: number;
  oldestQueuedJobAgeMs: number | null;
  oldestQueuedJobAt: string | null;
  queueDepth: number;
  providers: Array<{
    provider: string;
    authFailures: number;
    rateLimitFailures: number;
    attempts: number;
    connectionHealth: string | null;
    connectionStatus: string | null;
    stale: boolean;
    lastSync: string | null;
    lastPublishAt: string | null;
  }>;
  repeatedFailures: Array<{
    campaignName: string;
    published: number;
    failed: number;
    successRate: number | null;
  }>;
  dataQualityCount: number;
}): OperationalRecommendation[] {
  const out: OperationalRecommendation[] = [];
  const th = INTEL_THRESHOLDS;

  if (input.dlqCount >= th.dlqCountWarn) {
    const finding = withRunbook("replay_dlq", {
      id: "rec_address_dlq",
      severity: input.dlqCount >= th.dlqCountCritical ? "critical" : "warning",
      title: "Address dead-letter queue",
      why: `${input.dlqCount} job(s) are in dead_letter and will not retry automatically (+${input.dlqGrowth24h} in 24h).`,
      triggeredBy: ["dlqCount", "dlqGrowth24h"],
      evidence: { dlqCount: input.dlqCount, dlqGrowth24h: input.dlqGrowth24h },
      action: "Inspect failure class, fix root cause, then replay selectively.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "recommendation" });
  }

  if (input.retryBacklog >= th.retryBacklogWarn) {
    const finding = withRunbook("retry_failed_publish", {
      id: "rec_retry_backlog",
      severity: input.retryBacklog >= th.retryBacklogCritical ? "critical" : "warning",
      title: "Clear growing retry backlog",
      why: `${input.retryBacklog} job(s) await retry — above threshold ${th.retryBacklogWarn}.`,
      triggeredBy: ["retryBacklog"],
      evidence: { retryBacklog: input.retryBacklog },
      action: "Confirm worker throughput and provider stability; avoid burst republishing.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "recommendation" });
  }

  if (
    input.oldestQueuedJobAgeMs != null &&
    input.oldestQueuedJobAgeMs >= th.oldestQueuedWarnMs
  ) {
    const finding = withRunbook("verify_cron_health", {
      id: "rec_aging_queue",
      severity:
        input.oldestQueuedJobAgeMs >= th.oldestQueuedCriticalMs ? "critical" : "warning",
      title: "Investigate aging queued work",
      why: `Oldest active queue item is ~${Math.round(input.oldestQueuedJobAgeMs / 60_000)} minutes old.`,
      triggeredBy: ["oldestQueuedJobAgeMs", "queueDepth"],
      evidence: {
        oldestQueuedJobAt: input.oldestQueuedJobAt,
        oldestQueuedJobAgeMs: input.oldestQueuedJobAgeMs,
        queueDepth: input.queueDepth,
      },
      action: "Verify claim/lease path and provider availability.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "recommendation" });
  }

  if (input.stuckLedgerProcessing > 0) {
    const finding = withRunbook("recover_stuck_ledger", {
      id: "rec_stuck_ledger",
      severity: "warning",
      title: "Recover stuck idempotency ledger rows",
      why: `${input.stuckLedgerProcessing} ledger row(s) remain in processing and can block republish.`,
      triggeredBy: ["stuckLedgerProcessing"],
      evidence: { stuckLedgerProcessing: input.stuckLedgerProcessing },
      action: "Run recover-stuck-publish and confirm processing rows clear.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "recommendation" });
  }

  for (const p of input.providers) {
    if (p.connectionHealth === "error" || p.connectionStatus === "error") {
      const finding = withRunbook("reconnect_provider", {
        id: `rec_reconnect_${p.provider}`,
        severity: "critical",
        title: `Reconnect provider '${p.provider}'`,
        why: `Connection health is ${p.connectionHealth ?? "unknown"} (status ${p.connectionStatus ?? "unknown"}).`,
        triggeredBy: ["connectionHealth", "connectionStatus"],
        evidence: {
          provider: p.provider,
          connectionHealth: p.connectionHealth,
          connectionStatus: p.connectionStatus,
        },
        action: "Open Connected Accounts and reconnect / select location / rotate tokens.",
        detectedAt: input.detectedAt,
      });
      out.push({ ...finding, kind: "recommendation" });
    } else if (p.stale) {
      const finding = withRunbook("reconnect_provider", {
        id: `rec_stale_${p.provider}`,
        severity: "info",
        title: `Verify stale connection '${p.provider}'`,
        why: "Connected account has no recent sync or publish activity within the freshness window.",
        triggeredBy: ["staleConnection", "lastSync", "lastPublishAt"],
        evidence: {
          provider: p.provider,
          lastSync: p.lastSync,
          lastPublishAt: p.lastPublishAt,
        },
        action: "Run a diagnose/publish smoke on staging.",
        detectedAt: input.detectedAt,
      });
      out.push({ ...finding, kind: "recommendation" });
    }

    const authRate = rate(p.authFailures, p.attempts);
    if (p.authFailures >= th.authFailureCountWarn) {
      const finding = withRunbook("reconnect_provider", {
        id: `rec_auth_${p.provider}`,
        severity: "critical",
        title: `Investigate authentication failures on '${p.provider}'`,
        why: `Provider '${p.provider}' experienced a ${formatPct(authRate)} authentication failure rate (${p.authFailures}/${p.attempts || p.authFailures} attempts). Reconnect before scheduled publishing.`,
        triggeredBy: ["authFailures", "authFailureRate"],
        evidence: {
          provider: p.provider,
          authFailures: p.authFailures,
          attempts: p.attempts,
          authFailureRate: authRate,
        },
        action: "Reconnect OAuth / rotate Page token; confirm scopes.",
        detectedAt: input.detectedAt,
      });
      out.push({ ...finding, kind: "recommendation" });
    }

    if (p.rateLimitFailures >= th.rateLimitCountWarn) {
      const finding = withRunbook("inspect_provider_logs", {
        id: `rec_rate_limit_${p.provider}`,
        severity: "warning",
        title: `Ease rate limiting on '${p.provider}'`,
        why: `${p.rateLimitFailures} rate_limit failures observed in the window.`,
        triggeredBy: ["rateLimitFailures"],
        evidence: { provider: p.provider, rateLimitFailures: p.rateLimitFailures },
        action: "Reduce burst publishes; allow backoff; check provider quotas.",
        detectedAt: input.detectedAt,
      });
      out.push({ ...finding, kind: "recommendation" });
    }
  }

  if (
    input.publishSuccessRate != null &&
    input.publishSuccessRate < th.publishSuccessRateWarn &&
    input.failed > 0
  ) {
    const finding = withRunbook("inspect_provider_logs", {
      id: "rec_low_success_rate",
      severity:
        input.publishSuccessRate < th.publishSuccessRateCritical ? "critical" : "warning",
      title: "Improve publish success rate",
      why: `Success rate ${formatPct(input.publishSuccessRate)} (${input.published}/${input.published + input.failed}) is below ${formatPct(th.publishSuccessRateWarn)}.`,
      triggeredBy: ["publishSuccessRate", "failureRate"],
      evidence: {
        publishSuccessRate: input.publishSuccessRate,
        failureRate: input.failureRate,
        published: input.published,
        failed: input.failed,
      },
      action: "Review failure classes by provider and campaign.",
      detectedAt: input.detectedAt,
      href: "/office/marketing/intelligence?focus=campaigns",
    });
    out.push({ ...finding, kind: "recommendation" });
  }

  for (const c of input.repeatedFailures.slice(0, 5)) {
    const total = c.published + c.failed;
    const finding = withRunbook("review_campaign_content", {
      id: `rec_campaign_${c.campaignName}`,
      severity: "warning",
      title: `Review campaign '${c.campaignName}'`,
      why: `Campaign '${c.campaignName}' has repeated publish failures: ${formatPct(c.successRate)} success (${c.published}/${total}).`,
      triggeredBy: ["campaignSuccessRate", "campaignFailed"],
      evidence: {
        campaignName: c.campaignName,
        published: c.published,
        failed: c.failed,
        successRate: c.successRate,
      },
      action: "Fix captions/media/limits; re-test on staging.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "recommendation" });
  }

  if (input.dataQualityCount > 0) {
    const finding = withRunbook("inspect_data_quality", {
      id: "rec_data_quality",
      severity: "info",
      title: "Resolve data quality issues",
      why: `${input.dataQualityCount} data-quality finding(s) may undermine metric trustworthiness.`,
      triggeredBy: ["dataQualityCount"],
      evidence: { dataQualityCount: input.dataQualityCount },
      action: "Triage Platform Intelligence → Data quality before acting on sparse metrics.",
      detectedAt: input.detectedAt,
    });
    out.push({ ...finding, kind: "recommendation" });
  }

  return sortFindings(out);
}
