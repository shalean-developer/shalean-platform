/**
 * MKT-001E — Operational intelligence catalog (code SoT for thresholds / runbooks).
 * Human-readable mirror: docs/audits/marketing/MKT-001E-operational-intelligence-rules.md
 */

export type IntelligenceSeverity = "info" | "warning" | "critical";

export const INTELLIGENCE_SEVERITY_RANK: Record<IntelligenceSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

/** Deterministic thresholds — change here and update the rules catalog doc. */
export const INTEL_THRESHOLDS = {
  /** Publish success rate below this → warning alert + recommendation. */
  publishSuccessRateWarn: 0.7,
  /** Publish success rate below this → critical alert. */
  publishSuccessRateCritical: 0.5,
  /** Retryable jobs count. */
  retryBacklogWarn: 5,
  retryBacklogCritical: 20,
  /** Absolute DLQ depth. */
  dlqCountWarn: 1,
  dlqCountCritical: 5,
  /** DLQ growth in rolling 24h. */
  dlqGrowth24hWarn: 3,
  dlqGrowth24hCritical: 10,
  /** Auth-classified failures in window. */
  authFailureCountWarn: 3,
  /** Auth failure rate among provider attempts. */
  authFailureRateWarn: 0.1,
  /** Rate-limit failures in window. */
  rateLimitCountWarn: 3,
  /** Oldest active queue age. */
  oldestQueuedWarnMs: 30 * 60 * 1000,
  oldestQueuedCriticalMs: 2 * 60 * 60 * 1000,
  /** Connection freshness. */
  staleConnectionMs: 7 * 24 * 60 * 60 * 1000,
  /** Campaign repeated-failure gate. */
  campaignMinAttempts: 3,
  campaignFailRateWarn: 0.5,
  /** Cron worker stale (process-social-publish-jobs). Staging/pg_cron expected ~5m; allow buffer. */
  publishWorkerStaleAfterMinutes: 60,
  /** When queue has due work and worker is stale → elevate severity. */
  queueStallWithWorkCritical: true,
  /** Lease held longer than this without progress signals → invalid/stuck lease DQ. */
  leaseStuckMs: 15 * 60 * 1000,
  /** History vs jobs gap: jobs succeeded without history in window. */
  missingHistoryWarn: 1,
  /** SLI targets (objectives, not alert thresholds). */
  sli: {
    publishSuccessTarget: 0.95,
    medianLatencyTargetMs: 15_000,
    p95LatencyTargetMs: 60_000,
    retrySuccessTarget: 0.8,
    queueProcessingTargetMs: 10 * 60 * 1000,
  },
} as const;

export type IntelligenceRunbookId =
  | "reconnect_provider"
  | "replay_dlq"
  | "retry_failed_publish"
  | "verify_cron_health"
  | "inspect_provider_logs"
  | "inspect_data_quality"
  | "review_campaign_content"
  | "recover_stuck_ledger";

export type IntelligenceRunbook = {
  id: IntelligenceRunbookId;
  title: string;
  href: string;
  summary: string;
  steps: string[];
};

export const INTEL_RUNBOOKS: Record<IntelligenceRunbookId, IntelligenceRunbook> = {
  reconnect_provider: {
    id: "reconnect_provider",
    title: "Reconnect provider",
    href: "/office/marketing/connected-accounts",
    summary: "Repair OAuth / Page token / location selection for a provider.",
    steps: [
      "Open Growth → Connected Accounts.",
      "Inspect provider health, last error, and capability chips.",
      "For Google Business: Disconnect → Connect, then select a location.",
      "For Facebook: verify FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN on the deployment.",
      "Re-test with a small staging publish or diagnose GET.",
    ],
  },
  replay_dlq: {
    id: "replay_dlq",
    title: "Replay DLQ jobs",
    href: "/office/marketing/intelligence?focus=dlq",
    summary: "Explicitly replay dead-letter jobs after fixing root cause.",
    steps: [
      "Open Platform Intelligence → DLQ drill-down.",
      "Confirm failure_class and last_error (auth vs validation vs rate_limit).",
      "Fix credentials or payload first if non-retryable.",
      "Click Replay on the job (authorized admin POST).",
      "Watch correlation_id through queue → succeeded/history.",
    ],
  },
  retry_failed_publish: {
    id: "retry_failed_publish",
    title: "Retry failed publish",
    href: "/office/marketing/social",
    summary: "Re-publish or wait for automatic backoff on retryable jobs.",
    steps: [
      "If job status is retryable, wait for next_attempt_at or confirm worker cron is healthy.",
      "If history shows failed with retryable classification, use Social Posts retry/publish.",
      "Preserve the same logical idempotency key when replaying intentional duplicates.",
      "Use correlation_id in toasts/logs to confirm a single external post.",
    ],
  },
  verify_cron_health: {
    id: "verify_cron_health",
    title: "Verify cron health",
    href: "/office/marketing/intelligence?focus=queue",
    summary: "Confirm process-social-publish-jobs and recover-stuck-publish are running.",
    steps: [
      "Check Platform Intelligence cron worker status (last success / stale).",
      "Confirm CRON_SECRET is present on the staging deployment.",
      "Optionally invoke POST /api/cron/process-social-publish-jobs with cron secret (staging only).",
      "Confirm queue depth decreases and cron_runs records a success.",
      "If ledger rows stuck in processing, invoke recover-stuck-publish.",
    ],
  },
  inspect_provider_logs: {
    id: "inspect_provider_logs",
    title: "Inspect provider logs",
    href: "/office/marketing/connected-accounts",
    summary: "Trace correlation IDs and failure classes without exposing secrets.",
    steps: [
      "Copy correlation_id from intelligence drill-down or publish toast.",
      "Search system_logs / deployment logs for that correlation id.",
      "Group by failure_class (auth, rate_limit, timeout, …).",
      "Do not paste tokens or raw provider payloads into tickets.",
    ],
  },
  inspect_data_quality: {
    id: "inspect_data_quality",
    title: "Inspect data quality",
    href: "/office/marketing/intelligence?focus=data-quality",
    summary: "Resolve orphaned jobs, inconsistent timestamps, and mapping gaps.",
    steps: [
      "Open Platform Intelligence → Data quality issues.",
      "Triage critical issues first (invalid states, duplicate ledger keys).",
      "Fix upstream writers — do not hand-edit production rows casually.",
      "Re-run intelligence snapshot to confirm the issue clears.",
    ],
  },
  review_campaign_content: {
    id: "review_campaign_content",
    title: "Review campaign content",
    href: "/office/marketing/social",
    summary: "Fix captions, media requirements, and channel limits.",
    steps: [
      "Open Growth → Social Posts for the failing campaign.",
      "Validate caption length and image requirements per provider.",
      "Confirm provider is enabled and connected.",
      "Publish a corrected staging post and confirm history status=published.",
    ],
  },
  recover_stuck_ledger: {
    id: "recover_stuck_ledger",
    title: "Recover stuck ledger",
    href: "/office/marketing/intelligence?focus=queue",
    summary: "Reclaim marketing_publish_idempotency rows left in processing.",
    steps: [
      "Confirm stuckLedgerProcessing > 0 on the intelligence snapshot.",
      "Invoke /api/cron/recover-stuck-publish with cron secret (staging).",
      "Verify processing rows clear and interrupted jobs can resume.",
      "If a row remains stuck after reclaim TTL, escalate with correlation/ledger ids.",
    ],
  },
};

export type MetricCatalogEntry = {
  id: string;
  name: string;
  unit: "ratio" | "count" | "ms" | "string";
  description: string;
  source: string;
};

export const INTEL_METRICS: MetricCatalogEntry[] = [
  {
    id: "publishSuccessRate",
    name: "Publish success rate",
    unit: "ratio",
    description: "published / (published + failed) from social_publish_history in window",
    source: "social_publish_history",
  },
  {
    id: "failureRate",
    name: "Failure rate",
    unit: "ratio",
    description: "failed / (published + failed) from history",
    source: "social_publish_history",
  },
  {
    id: "retryRate",
    name: "Retry rate",
    unit: "ratio",
    description: "retryable depth relative to jobs in window",
    source: "social_publish_jobs",
  },
  {
    id: "dlqCount",
    name: "DLQ count",
    unit: "count",
    description: "Jobs with status=dead_letter",
    source: "social_publish_jobs",
  },
  {
    id: "dlqGrowth24h",
    name: "DLQ growth (24h)",
    unit: "count",
    description: "Dead-lettered in last 24 hours",
    source: "social_publish_jobs.dead_lettered_at",
  },
  {
    id: "queueDepth",
    name: "Queue depth",
    unit: "count",
    description: "queued + leased + retryable",
    source: "social_publish_jobs",
  },
  {
    id: "avgPublishLatencyMs",
    name: "Average publish latency",
    unit: "ms",
    description: "Mean created_at → processed_at for succeeded jobs",
    source: "social_publish_jobs",
  },
  {
    id: "medianPublishLatencyMs",
    name: "Median publish latency",
    unit: "ms",
    description: "p50 created_at → processed_at",
    source: "social_publish_jobs",
  },
  {
    id: "p95PublishLatencyMs",
    name: "p95 publish latency",
    unit: "ms",
    description: "p95 created_at → processed_at",
    source: "social_publish_jobs",
  },
  {
    id: "retrySuccessRate",
    name: "Retry success rate",
    unit: "ratio",
    description: "Succeeded jobs with attempts>1 / (succeeded + dead_letter with attempts>1)",
    source: "social_publish_jobs",
  },
  {
    id: "jobsAwaitingRetry",
    name: "Jobs awaiting retry",
    unit: "count",
    description: "status=retryable",
    source: "social_publish_jobs",
  },
  {
    id: "stuckLedgerProcessing",
    name: "Stuck ledger processing",
    unit: "count",
    description: "marketing_publish_idempotency status=processing",
    source: "marketing_publish_idempotency",
  },
  {
    id: "oldestQueuedJobAgeMs",
    name: "Oldest queued job age",
    unit: "ms",
    description: "Age of oldest queued|retryable|leased job",
    source: "social_publish_jobs",
  },
  {
    id: "providerAvailability",
    name: "Provider availability",
    unit: "ratio",
    description: "Healthy/connected accounts over total social_accounts",
    source: "social_accounts",
  },
  {
    id: "workerThroughput24h",
    name: "Worker throughput (24h)",
    unit: "count",
    description: "Jobs succeeded with processed_at in last 24h",
    source: "social_publish_jobs",
  },
];

export type SliCatalogEntry = {
  id: string;
  name: string;
  metricId: string;
  target: number;
  unit: "ratio" | "ms";
  description: string;
};

export const INTEL_SLIS: SliCatalogEntry[] = [
  {
    id: "sli_publish_success",
    name: "Publish success %",
    metricId: "publishSuccessRate",
    target: INTEL_THRESHOLDS.sli.publishSuccessTarget,
    unit: "ratio",
    description: "Target fraction of history publishes that succeed",
  },
  {
    id: "sli_median_latency",
    name: "Median publish latency",
    metricId: "medianPublishLatencyMs",
    target: INTEL_THRESHOLDS.sli.medianLatencyTargetMs,
    unit: "ms",
    description: "p50 job processing latency",
  },
  {
    id: "sli_p95_latency",
    name: "95th percentile publish latency",
    metricId: "p95PublishLatencyMs",
    target: INTEL_THRESHOLDS.sli.p95LatencyTargetMs,
    unit: "ms",
    description: "p95 job processing latency",
  },
  {
    id: "sli_queue_processing",
    name: "Queue processing time",
    metricId: "oldestQueuedJobAgeMs",
    target: INTEL_THRESHOLDS.sli.queueProcessingTargetMs,
    unit: "ms",
    description: "Oldest active queue item should stay under target age",
  },
  {
    id: "sli_retry_success",
    name: "Retry success rate",
    metricId: "retrySuccessRate",
    target: INTEL_THRESHOLDS.sli.retrySuccessTarget,
    unit: "ratio",
    description: "Fraction of retried jobs that eventually succeed",
  },
];
