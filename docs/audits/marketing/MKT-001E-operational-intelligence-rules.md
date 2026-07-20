# MKT-001E — Operational Intelligence Rules Catalog

**Project:** Shalean Cleaning Services  
**Phase:** MKT-001E — Platform Intelligence (decision engine)  
**Date:** 2026-07-17  
**Branch:** `feature/mkt-001e-platform-intelligence`  
**Code SoT:** `apps/web/lib/promotions/publishIntelligenceCatalog.ts`  
**Decision engine:** `apps/web/lib/promotions/publishIntelligenceDecision.ts`

This document is the version-controlled catalog of every metric, SLI, threshold, alert, recommendation, data-quality check, severity level, and runbook used by Platform Intelligence. When thresholds change, update **both** this file and the code catalog in the same PR.

---

## 1. Severity levels

| Severity | Rank | Meaning | Operator expectation |
|---|---|---|---|
| `critical` | 0 | Immediate operational risk | Act now; may block publishing |
| `warning` | 1 | Degraded health or rising risk | Investigate within the shift |
| `info` | 2 | Awareness / hygiene | Plan follow-up |

Findings (alerts, recommendations, data-quality issues) sort critical → warning → info, then by id.

---

## 2. Metrics

| Metric id | Name | Unit | Source | Formula / definition |
|---|---|---|---|---|
| `publishSuccessRate` | Publish success rate | ratio | `social_publish_history` | `published / (published + failed)` in window |
| `failureRate` | Failure rate | ratio | `social_publish_history` | `failed / (published + failed)` |
| `retryRate` | Retry rate | ratio | `social_publish_jobs` | `retryable / max(jobsInWindow, retryable)` |
| `dlqCount` | DLQ count | count | `social_publish_jobs` | rows with `status=dead_letter` |
| `dlqGrowth24h` | DLQ growth (24h) | count | `social_publish_jobs` | dead-lettered in last 24h |
| `queueDepth` | Queue depth | count | `social_publish_jobs` | `queued + leased + retryable` |
| `avgPublishLatencyMs` | Average publish latency | ms | `social_publish_jobs` | mean `created_at → processed_at` (succeeded) |
| `medianPublishLatencyMs` | Median publish latency | ms | `social_publish_jobs` | p50 latency |
| `p95PublishLatencyMs` | p95 publish latency | ms | `social_publish_jobs` | p95 latency |
| `retrySuccessRate` | Retry success rate | ratio | `social_publish_jobs` | succeeded with `attempts>1` / terminal retries |
| `recoveryTimeMs` | Recovery time | ms | `social_publish_jobs` | median latency for succeeded jobs with `attempts>1` |
| `jobsAwaitingRetry` | Jobs awaiting retry | count | `social_publish_jobs` | `status=retryable` |
| `stuckLedgerProcessing` | Stuck ledger processing | count | `marketing_publish_idempotency` | `status=processing` |
| `oldestQueuedJobAgeMs` | Oldest queued job age | ms | `social_publish_jobs` | age of oldest queued\|retryable\|leased |
| `providerAvailability` | Provider availability | ratio | `social_accounts` | healthy/connected ÷ total accounts |
| `workerThroughput24h` | Worker throughput (24h) | count | `social_publish_jobs` | succeeded with `processed_at` in 24h |
| `workerStatus` | Cron worker status | string | `cron_runs` | `never_run\|stale\|failed\|succeeded\|currently_running` |
| `authFailures` | Auth failures | count | `social_publish_jobs.failure_class` | `failure_class=auth` |
| `rateLimitFailures` | Rate-limit failures | count | `social_publish_jobs.failure_class` | `failure_class=rate_limit` |
| `staleConnections` | Stale connections | count | `social_accounts` | connected but no sync/publish within freshness window |

Null rates are returned when denominators are zero (sparse windows are honest, not zero-filled).

---

## 3. Service Level Indicators (SLIs)

| SLI id | Name | Metric | Target | Met when |
|---|---|---|---|---|
| `sli_publish_success` | Publish success % | `publishSuccessRate` | ≥ **0.95** | value ≥ target |
| `sli_median_latency` | Median publish latency | `medianPublishLatencyMs` | ≤ **15_000 ms** | value ≤ target |
| `sli_p95_latency` | 95th percentile publish latency | `p95PublishLatencyMs` | ≤ **60_000 ms** | value ≤ target |
| `sli_queue_processing` | Queue processing time | `oldestQueuedJobAgeMs` | ≤ **600_000 ms** (10m) | value ≤ target |
| `sli_retry_success` | Retry success rate | `retrySuccessRate` | ≥ **0.80** | value ≥ target |
| `sli_recovery_time` | Recovery time from provider failures | `recoveryTimeMs` | ≤ **600_000 ms** | value ≤ target |

SLIs are objectives. Alerts may use different (usually stricter) operational thresholds.

---

## 4. Thresholds

| Key | Value | Used by |
|---|---|---|
| `publishSuccessRateWarn` | 0.70 | alert + recommendation |
| `publishSuccessRateCritical` | 0.50 | alert + recommendation |
| `retryBacklogWarn` | 5 | alert + recommendation |
| `retryBacklogCritical` | 20 | alert + recommendation |
| `dlqCountWarn` | 1 | alert + recommendation |
| `dlqCountCritical` | 5 | alert + recommendation |
| `dlqGrowth24hWarn` | 3 | alert |
| `dlqGrowth24hCritical` | 10 | alert |
| `authFailureCountWarn` | 3 | alert + recommendation |
| `authFailureRateWarn` | 0.10 | alert (requires ≥5 attempts) |
| `rateLimitCountWarn` | 3 | recommendation |
| `oldestQueuedWarnMs` | 30 minutes | alert + recommendation |
| `oldestQueuedCriticalMs` | 2 hours | elevate severity |
| `staleConnectionMs` | 7 days | stale connection detection |
| `campaignMinAttempts` | 3 | campaign ranking |
| `campaignFailRateWarn` | 0.50 | repeated-failure campaigns |
| `publishWorkerStaleAfterMinutes` | 60 | cron worker health |
| `leaseStuckMs` | 15 minutes | invalid leased state DQ |
| `missingHistoryWarn` | 1 | missing history DQ |

Defined in code as `INTEL_THRESHOLDS`.

---

## 5. Alert rules

Every alert includes: **severity**, **timestamp (`detectedAt`)**, **why**, **triggeredBy**, **evidence**, **action**, **runbook**.

| Code | Condition | Severity | Recommended action | Runbook |
|---|---|---|---|---|
| `publish_success_below_threshold` | success &lt; 0.70 (warn) or &lt; 0.50 (critical) with attempts | warning / critical | Triage failure classes; pause risky campaigns | `inspect_provider_logs` |
| `retry_backlog_exceeded` | retry backlog ≥ 5 / ≥ 20 | warning / critical | Verify worker + provider stability | `verify_cron_health` |
| `dlq_growth_spike` | DLQ depth or 24h growth above warn/critical | warning / critical | Inspect DLQ; fix root cause; replay | `replay_dlq` |
| `provider_auth_failures` | auth count ≥ 3 **or** auth rate ≥ 10% (≥5 attempts) | critical | Reconnect provider before further publishes | `reconnect_provider` |
| `queue_processing_stalled` | oldest job age ≥ 30m with queue depth &gt; 0 | warning / critical | Verify claim/lease + cron | `verify_cron_health` |
| `cron_worker_not_running` | worker `stale` / `never_run` / `failed` | warning (idle) / critical (with work) | Confirm schedules + `CRON_SECRET` | `verify_cron_health` |
| `provider_disabled_unexpectedly` | recent activity/connection but registry disables publish | warning | Confirm intentional flag change | `inspect_data_quality` |

---

## 6. Recommendation rules

Recommendations are actionable follow-ups. They share the same explainability contract as alerts.

| Id pattern | Condition | Severity | Runbook |
|---|---|---|---|
| `rec_address_dlq` | `dlqCount ≥ 1` | warning / critical | `replay_dlq` |
| `rec_retry_backlog` | retry backlog ≥ 5 | warning / critical | `retry_failed_publish` |
| `rec_aging_queue` | oldest job age ≥ 30m | warning / critical | `verify_cron_health` |
| `rec_stuck_ledger` | stuck ledger processing &gt; 0 | warning | `recover_stuck_ledger` |
| `rec_reconnect_{provider}` | connection health/status `error` | critical | `reconnect_provider` |
| `rec_stale_{provider}` | stale connected account | info | `reconnect_provider` |
| `rec_auth_{provider}` | auth failures ≥ 3 | critical | `reconnect_provider` |
| `rec_rate_limit_{provider}` | rate_limit failures ≥ 3 | warning | `inspect_provider_logs` |
| `rec_low_success_rate` | success &lt; 0.70 with failures | warning / critical | `inspect_provider_logs` |
| `rec_campaign_{name}` | campaign ≥ 3 attempts and success &lt; 50% | warning | `review_campaign_content` |
| `rec_data_quality` | any DQ findings | info | `inspect_data_quality` |

### Explainability contract

Each recommendation must answer:

1. **Why** is this shown? (`why`)
2. **Which metrics triggered it?** (`triggeredBy`)
3. **What evidence supports it?** (`evidence`)
4. **What action is recommended?** (`action`)
5. **Which runbook resolves it?** (`runbookId` / `runbookHref`)

Example:

> Provider 'facebook' experienced a 14% authentication failure rate in the last window (12/85 attempts). Reconnect the account before scheduled publishing.

---

## 7. Data quality rules

DQ findings are **surfaced**, never silently excluded from reporting.

| Code | Condition | Severity | Runbook |
|---|---|---|---|
| `missing_publish_history` | succeeded jobs count exceeds published history in window | warning | `inspect_data_quality` |
| `orphaned_queue_job` | active jobs reference missing promotions | warning | `inspect_data_quality` |
| `invalid_job_state` | leased without lease metadata, or lease expired beyond stuck window | critical | `inspect_data_quality` |
| `missing_provider_mapping` | jobs for providers with no `social_accounts` row | warning | `inspect_data_quality` |
| `duplicate_idempotency` | multiple active jobs share `(provider, idempotency_key)` | critical | `inspect_data_quality` |
| `inconsistent_timestamps` | `processed_at` / `dead_lettered_at` before `created_at` | info | `inspect_data_quality` |
| `invalid_provider_capability` | enabled registry entry with `publishEnabled=false` capability | warning | `inspect_data_quality` |

---

## 8. Operational runbooks

| Runbook id | Title | Primary href | Purpose |
|---|---|---|---|
| `reconnect_provider` | Reconnect provider | `/office/marketing/connected-accounts` | OAuth / Page token / location repair |
| `replay_dlq` | Replay DLQ jobs | `/office/marketing/intelligence?focus=dlq` | Explicit DLQ replay after root-cause fix |
| `retry_failed_publish` | Retry failed publish | `/office/marketing/social` | Manual or automatic retry path |
| `verify_cron_health` | Verify cron health | `/office/marketing/intelligence?focus=queue` | Worker + recover-stuck-publish |
| `inspect_provider_logs` | Inspect provider logs | `/office/marketing/connected-accounts` | Correlation-id tracing (no secrets) |
| `inspect_data_quality` | Inspect data quality | `/office/marketing/intelligence?focus=data-quality` | DQ triage |
| `review_campaign_content` | Review campaign content | `/office/marketing/social` | Captions / media / limits |
| `recover_stuck_ledger` | Recover stuck ledger | `/office/marketing/intelligence?focus=queue` | Reclaim processing ledger rows |

Full step lists live in `INTEL_RUNBOOKS` (code) and are summarized in the intelligence UI.

---

## 9. Dashboard customization

| Capability | Mechanism |
|---|---|
| Filter by time range | `windowHours=24\|72\|168` |
| Filter by provider | query + UI input → API `provider` |
| Filter by campaign | query + UI input → API `campaign` (ilike) |
| Save common views | browser `localStorage` key `mkt-001e-intel-views` |
| Drill into campaign/provider | click campaign/provider chips to set filters; DLQ replay + Connected Accounts links |

---

## 10. Governance

- Staging-only engineering phase.
- Do **not** merge to `main` or deploy production while **MKT-001A-PROD** remains OPEN / NO-GO.
- Intelligence is read-only over existing SoT; no duplicate metrics warehouse.
- No AI-generated content in this phase.

---

## 11. Change control

1. Edit `INTEL_THRESHOLDS` / rules in code.
2. Update this catalog in the same PR.
3. Add/adjust unit tests in `publishIntelligence.mkt001e.test.ts`.
4. Note the change in `MKT-001E-platform-intelligence.md` if behavior meaningfully shifts.

*End of operational intelligence rules catalog.*
