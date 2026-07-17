/**
 * MKT-001E — Platform Intelligence (operational decision engine)
 *
 * Read-only aggregation + deterministic recommendations/alerts/DQ/SLIs over
 * existing social_publish_jobs, social_publish_history, marketing_publish_idempotency,
 * social_accounts, campaign_content, cron_runs, and the provider registry.
 * No new source-of-truth tables.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchCronRunHealth } from "@/lib/cron/cronRunHealth";
import { INTEL_RUNBOOKS, INTEL_THRESHOLDS } from "@/lib/promotions/publishIntelligenceCatalog";
import {
  avg,
  buildOperationalAlerts,
  buildOperationalRecommendations,
  buildServiceLevelIndicators,
  computeLatencyStats,
  evaluateDataQualityIssues,
  rate,
  type DataQualityIssue,
  type OperationalAlert,
  type OperationalRecommendation,
  type ServiceLevelIndicator,
} from "@/lib/promotions/publishIntelligenceDecision";
import { getProviderRegistry } from "@/lib/promotions/providers";
import type { PublishFailureClass } from "@/lib/promotions/publishProviderErrors";

export type IntelligenceWindowHours = 24 | 72 | 168;

/** @deprecated Prefer OperationalRecommendation — kept for transition. */
export type PublishIntelligenceRecommendation = OperationalRecommendation;

export type QueueDepthByStatus = {
  queued: number;
  leased: number;
  retryable: number;
  succeeded: number;
  dead_letter: number;
  cancelled: number;
};

export type ProviderIntelRow = {
  provider: string;
  successCount: number;
  failureCount: number;
  attempts: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  errorCategories: Record<string, number>;
  authFailures: number;
  rateLimitFailures: number;
  connectionHealth: string | null;
  connectionStatus: string | null;
  lastPublishAt: string | null;
  lastSync: string | null;
  stale: boolean;
  providerEnabled: boolean | null;
  publishEnabled: boolean | null;
  unexpectedDisabled: boolean;
};

export type CampaignIntelRow = {
  campaignName: string;
  promotionId: string | null;
  published: number;
  failed: number;
  successRate: number | null;
  providers: Record<string, number>;
};

export type DailyTrendPoint = {
  day: string;
  published: number;
  failed: number;
  retries: number;
  dlq: number;
};

export type PublishIntelligenceSnapshot = {
  generatedAt: string;
  windowHours: IntelligenceWindowHours;
  filters: { provider: string | null; campaign: string | null };
  operationalHealth: {
    publishSuccessRate: number | null;
    failureRate: number | null;
    retryRate: number | null;
    dlqCount: number;
    queueDepth: number;
    avgPublishLatencyMs: number | null;
    medianPublishLatencyMs: number | null;
    p95PublishLatencyMs: number | null;
    retrySuccessRate: number | null;
    recoveryTimeMs: number | null;
    providerAvailability: number | null;
    connectionHealthyCount: number;
    connectionTotalCount: number;
    staleConnections: number;
    jobsAwaitingRetry: number;
    stuckLedgerProcessing: number;
    oldestQueuedJobAt: string | null;
    oldestQueuedJobAgeMs: number | null;
    historyPublished: number;
    historyFailed: number;
  };
  slis: ServiceLevelIndicator[];
  queue: QueueDepthByStatus & {
    processingRatePerHour: number | null;
    retryBacklog: number;
    dlqGrowth24h: number;
    workerThroughput24h: number;
    workerStatus: string;
    workerLastSuccessAt: string | null;
  };
  providers: ProviderIntelRow[];
  campaigns: {
    mostSuccessful: CampaignIntelRow[];
    repeatedFailures: CampaignIntelRow[];
    draftVsPublished: { draft: number; ready: number; published: number; archived: number };
    providerDistribution: Record<string, number>;
  };
  trends: DailyTrendPoint[];
  dataQuality: DataQualityIssue[];
  alerts: OperationalAlert[];
  recommendations: OperationalRecommendation[];
  runbooks: Array<{ id: string; title: string; href: string; summary: string }>;
  drilldown: {
    recentFailures: Array<{
      id: string;
      source: "history" | "job";
      provider: string;
      campaignName: string | null;
      status: string;
      failureClass: string | null;
      errorMessage: string | null;
      correlationId: string | null;
      createdAt: string;
    }>;
    dlqJobs: Array<{
      id: string;
      provider: string;
      campaignName: string | null;
      failureClass: string | null;
      lastError: string | null;
      correlationId: string;
      attempts: number;
      deadLetteredAt: string | null;
    }>;
  };
};

const JOB_STATUSES = [
  "queued",
  "leased",
  "retryable",
  "succeeded",
  "dead_letter",
  "cancelled",
] as const;

const CONTENT_STATUSES = ["draft", "ready", "published", "archived"] as const;

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  return d.toISOString().slice(0, 10);
}

function windowStartIso(hours: IntelligenceWindowHours, now = Date.now()): string {
  return new Date(now - hours * 60 * 60 * 1000).toISOString();
}

async function headCount(
  admin: SupabaseClient,
  table: string,
  apply: (q: {
    eq: (column: string, value: string) => unknown;
    gte: (column: string, value: string) => unknown;
  }) => unknown,
): Promise<number> {
  const base = admin.from(table).select("*", { count: "exact", head: true });
  const q = apply(base as never) as PromiseLike<{
    count: number | null;
    error: { message: string } | null;
  }>;
  const { count, error } = await q;
  if (error) return 0;
  return count ?? 0;
}

export function computeOperationalRates(input: {
  published: number;
  failed: number;
  retryable: number;
  succeededJobs: number;
  totalJobsInWindow: number;
}): {
  publishSuccessRate: number | null;
  failureRate: number | null;
  retryRate: number | null;
} {
  const historyTotal = input.published + input.failed;
  return {
    publishSuccessRate: rate(input.published, historyTotal),
    failureRate: rate(input.failed, historyTotal),
    retryRate: rate(input.retryable, Math.max(input.totalJobsInWindow, input.retryable)),
  };
}

export function isStaleConnection(input: {
  status: string | null;
  health: string | null;
  lastSync: string | null;
  lastPublishAt: string | null;
  nowMs?: number;
  staleMs?: number;
}): boolean {
  const now = input.nowMs ?? Date.now();
  const staleMs = input.staleMs ?? INTEL_THRESHOLDS.staleConnectionMs;
  const connected =
    input.status === "connected" ||
    input.status === "pending_location" ||
    input.health === "healthy" ||
    input.health === "degraded";
  if (!connected) return false;
  const anchors = [input.lastSync, input.lastPublishAt]
    .map((v) => (v ? Date.parse(v) : NaN))
    .filter((t) => !Number.isNaN(t));
  if (anchors.length === 0) return true;
  return now - Math.max(...anchors) > staleMs;
}

/** @deprecated Use buildOperationalRecommendations — thin adapter for older tests. */
export function buildPublishIntelligenceRecommendations(input: {
  operationalHealth: PublishIntelligenceSnapshot["operationalHealth"];
  queue: Pick<PublishIntelligenceSnapshot["queue"], "retryBacklog" | "dlqGrowth24h" | "dead_letter">;
  providers: ProviderIntelRow[];
  repeatedFailures: CampaignIntelRow[];
  detectedAt?: string;
}): OperationalRecommendation[] {
  return buildOperationalRecommendations({
    detectedAt: input.detectedAt ?? new Date().toISOString(),
    publishSuccessRate: input.operationalHealth.publishSuccessRate,
    failureRate: input.operationalHealth.failureRate,
    published: input.operationalHealth.historyPublished,
    failed: input.operationalHealth.historyFailed,
    retryBacklog: input.queue.retryBacklog,
    dlqCount: input.operationalHealth.dlqCount,
    dlqGrowth24h: input.queue.dlqGrowth24h,
    stuckLedgerProcessing: input.operationalHealth.stuckLedgerProcessing,
    oldestQueuedJobAgeMs: input.operationalHealth.oldestQueuedJobAgeMs,
    oldestQueuedJobAt: input.operationalHealth.oldestQueuedJobAt,
    queueDepth: input.operationalHealth.queueDepth,
    providers: input.providers.map((p) => ({
      provider: p.provider,
      authFailures: p.authFailures,
      rateLimitFailures: p.rateLimitFailures,
      attempts: p.attempts,
      connectionHealth: p.connectionHealth,
      connectionStatus: p.connectionStatus,
      stale: p.stale,
      lastSync: p.lastSync,
      lastPublishAt: p.lastPublishAt,
    })),
    repeatedFailures: input.repeatedFailures,
    dataQualityCount: 0,
  });
}

export function aggregateCampaignIntel(
  rows: Array<{
    campaign_name: string | null;
    promotion_id: string | null;
    status: string;
    provider: string;
  }>,
): {
  mostSuccessful: CampaignIntelRow[];
  repeatedFailures: CampaignIntelRow[];
  providerDistribution: Record<string, number>;
} {
  const byCampaign = new Map<string, CampaignIntelRow>();
  const providerDistribution: Record<string, number> = {};

  for (const row of rows) {
    const name = (row.campaign_name ?? "").trim() || "(unnamed)";
    const existing =
      byCampaign.get(name) ??
      ({
        campaignName: name,
        promotionId: row.promotion_id,
        published: 0,
        failed: 0,
        successRate: null,
        providers: {},
      } satisfies CampaignIntelRow);

    if (row.status === "published" || row.status === "succeeded") existing.published += 1;
    else if (row.status === "failed" || row.status === "dead_letter") existing.failed += 1;

    existing.providers[row.provider] = (existing.providers[row.provider] ?? 0) + 1;
    providerDistribution[row.provider] = (providerDistribution[row.provider] ?? 0) + 1;
    if (!existing.promotionId && row.promotion_id) existing.promotionId = row.promotion_id;
    byCampaign.set(name, existing);
  }

  const list = [...byCampaign.values()].map((c) => ({
    ...c,
    successRate: rate(c.published, c.published + c.failed),
  }));

  const min = INTEL_THRESHOLDS.campaignMinAttempts;
  const failWarn = INTEL_THRESHOLDS.campaignFailRateWarn;

  return {
    mostSuccessful: list
      .filter((c) => c.published + c.failed >= min)
      .sort((a, b) => (b.successRate ?? 0) - (a.successRate ?? 0) || b.published - a.published)
      .slice(0, 8),
    repeatedFailures: list
      .filter((c) => c.published + c.failed >= min && (c.successRate ?? 1) < failWarn)
      .sort((a, b) => b.failed - a.failed || (a.successRate ?? 1) - (b.successRate ?? 1))
      .slice(0, 8),
    providerDistribution,
  };
}

export function buildDailyTrends(
  rows: Array<{ created_at: string; status: string; attempts?: number }>,
  days: number,
  nowMs = Date.now(),
): DailyTrendPoint[] {
  const points = new Map<string, DailyTrendPoint>();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(nowMs - i * 24 * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 10);
    points.set(key, { day: key, published: 0, failed: 0, retries: 0, dlq: 0 });
  }
  for (const row of rows) {
    const key = dayKey(row.created_at);
    const point = points.get(key);
    if (!point) continue;
    if (row.status === "published" || row.status === "succeeded") point.published += 1;
    if (row.status === "failed") point.failed += 1;
    if (row.status === "dead_letter") {
      point.dlq += 1;
      point.failed += 1;
    }
    if ((row.attempts ?? 0) > 1 || row.status === "retryable") point.retries += 1;
  }
  return [...points.values()];
}

export async function getQueueDepthByStatus(admin: SupabaseClient): Promise<QueueDepthByStatus> {
  const parts = await Promise.all(
    JOB_STATUSES.map(async (status) => {
      const n = await headCount(admin, "social_publish_jobs", (q) => q.eq("status", status));
      return [status, n] as const;
    }),
  );
  const by = Object.fromEntries(parts) as Record<(typeof JOB_STATUSES)[number], number>;
  return {
    queued: by.queued,
    leased: by.leased,
    retryable: by.retryable,
    succeeded: by.succeeded,
    dead_letter: by.dead_letter,
    cancelled: by.cancelled,
  };
}

export async function listPublishJobsForIntelligence(
  admin: SupabaseClient,
  opts: {
    status?: string | null;
    provider?: string | null;
    campaign?: string | null;
    limit?: number;
  } = {},
): Promise<
  Array<{
    id: string;
    provider: string;
    campaign_name: string | null;
    status: string;
    failure_class: string | null;
    last_error: string | null;
    correlation_id: string;
    attempts: number;
    max_attempts: number;
    scheduled_for: string;
    next_attempt_at: string | null;
    dead_lettered_at: string | null;
    processed_at: string | null;
    created_at: string;
    updated_at: string;
  }>
> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 100);
  let q = admin
    .from("social_publish_jobs")
    .select(
      "id, provider, campaign_name, status, failure_class, last_error, correlation_id, attempts, max_attempts, scheduled_for, next_attempt_at, dead_lettered_at, processed_at, created_at, updated_at",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (opts.status) q = q.eq("status", opts.status);
  if (opts.provider) q = q.eq("provider", opts.provider);
  if (opts.campaign) q = q.ilike("campaign_name", `%${opts.campaign}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    provider: string;
    campaign_name: string | null;
    status: string;
    failure_class: string | null;
    last_error: string | null;
    correlation_id: string;
    attempts: number;
    max_attempts: number;
    scheduled_for: string;
    next_attempt_at: string | null;
    dead_lettered_at: string | null;
    processed_at: string | null;
    created_at: string;
    updated_at: string;
  }>;
}

export async function getPublishIntelligenceSnapshot(
  admin: SupabaseClient,
  opts: {
    windowHours?: IntelligenceWindowHours;
    nowMs?: number;
    provider?: string | null;
    campaign?: string | null;
  } = {},
): Promise<PublishIntelligenceSnapshot> {
  const windowHours = opts.windowHours ?? 72;
  const nowMs = opts.nowMs ?? Date.now();
  const detectedAt = new Date(nowMs).toISOString();
  const since = windowStartIso(windowHours, nowMs);
  const since24h = windowStartIso(24, nowMs);
  const providerFilter = opts.provider?.trim() || null;
  const campaignFilter = opts.campaign?.trim() || null;

  const depth = await getQueueDepthByStatus(admin);
  const queueDepth = depth.queued + depth.leased + depth.retryable;

  const [
    historyPublished,
    historyFailed,
    jobsSucceededWindow,
    jobsTotalWindow,
    stuckLedger,
    dlqGrowth24h,
    workerThroughput24h,
  ] = await Promise.all([
    headCount(admin, "social_publish_history", (q) =>
      q.eq("status", "published").gte("created_at", since),
    ),
    headCount(admin, "social_publish_history", (q) =>
      q.eq("status", "failed").gte("created_at", since),
    ),
    headCount(admin, "social_publish_jobs", (q) =>
      q.eq("status", "succeeded").gte("created_at", since),
    ),
    headCount(admin, "social_publish_jobs", (q) => q.gte("created_at", since)),
    headCount(admin, "marketing_publish_idempotency", (q) => q.eq("status", "processing")),
    headCount(admin, "social_publish_jobs", (q) =>
      q.eq("status", "dead_letter").gte("dead_lettered_at", since24h),
    ),
    headCount(admin, "social_publish_jobs", (q) =>
      q.eq("status", "succeeded").gte("processed_at", since24h),
    ),
  ]);

  const rates = computeOperationalRates({
    published: historyPublished,
    failed: historyFailed,
    retryable: depth.retryable,
    succeededJobs: jobsSucceededWindow,
    totalJobsInWindow: jobsTotalWindow,
  });

  const { data: oldestQueued } = await admin
    .from("social_publish_jobs")
    .select("created_at, scheduled_for")
    .in("status", ["queued", "retryable", "leased"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const oldestQueuedJobAt =
    oldestQueued && typeof oldestQueued.created_at === "string" ? oldestQueued.created_at : null;
  const oldestQueuedJobAgeMs = oldestQueuedJobAt
    ? Math.max(0, nowMs - Date.parse(oldestQueuedJobAt))
    : null;

  const { data: latencyRows } = await admin
    .from("social_publish_jobs")
    .select("created_at, processed_at, attempts")
    .eq("status", "succeeded")
    .gte("processed_at", since)
    .not("processed_at", "is", null)
    .limit(300);

  const latencies: number[] = [];
  const recoveryLatencies: number[] = [];
  for (const row of latencyRows ?? []) {
    const start = Date.parse(String(row.created_at));
    const end = Date.parse(String(row.processed_at));
    if (!Number.isNaN(start) && !Number.isNaN(end) && end >= start) {
      const ms = end - start;
      latencies.push(ms);
      if (typeof row.attempts === "number" && row.attempts > 1) recoveryLatencies.push(ms);
    }
  }
  const latencyStats = computeLatencyStats(latencies);

  const { data: retryOutcomeRows } = await admin
    .from("social_publish_jobs")
    .select("status, attempts")
    .in("status", ["succeeded", "dead_letter"])
    .gt("attempts", 1)
    .gte("created_at", since)
    .limit(300);
  const retrySucceeded = (retryOutcomeRows ?? []).filter((r) => r.status === "succeeded").length;
  const retryTerminal = (retryOutcomeRows ?? []).length;
  const retrySuccessRate = rate(retrySucceeded, retryTerminal);

  const { data: accounts } = await admin
    .from("social_accounts")
    .select("provider, status, health, last_sync, last_publish_at");

  const accountRows = (accounts ?? []) as Array<{
    provider: string;
    status: string | null;
    health: string | null;
    last_sync: string | null;
    last_publish_at: string | null;
  }>;

  const connectionHealthyCount = accountRows.filter(
    (a) => a.health === "healthy" || a.status === "connected",
  ).length;
  const staleConnections = accountRows.filter((a) =>
    isStaleConnection({
      status: a.status,
      health: a.health,
      lastSync: a.last_sync,
      lastPublishAt: a.last_publish_at,
      nowMs,
    }),
  ).length;

  let jobQuery = admin
    .from("social_publish_jobs")
    .select(
      "provider, failure_class, status, campaign_name, promotion_id, created_at, attempts, last_error, correlation_id, id, dead_lettered_at, processed_at, lease_holder, lease_expires_at, idempotency_key",
    )
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);
  if (providerFilter) jobQuery = jobQuery.eq("provider", providerFilter);
  if (campaignFilter) jobQuery = jobQuery.ilike("campaign_name", `%${campaignFilter}%`);
  const { data: jobFailRowsRaw } = await jobQuery;

  let historyQuery = admin
    .from("social_publish_history")
    .select("id, provider, campaign_name, promotion_id, status, error_message, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(400);
  if (providerFilter) historyQuery = historyQuery.eq("provider", providerFilter);
  if (campaignFilter) historyQuery = historyQuery.ilike("campaign_name", `%${campaignFilter}%`);
  const { data: historyRowsRaw } = await historyQuery;

  const jobFailRows = (jobFailRowsRaw ?? []) as Array<{
    id: string;
    provider: string;
    failure_class: string | null;
    status: string;
    campaign_name: string | null;
    promotion_id: string | null;
    created_at: string;
    attempts: number;
    last_error: string | null;
    correlation_id: string;
    dead_lettered_at: string | null;
    processed_at: string | null;
    lease_holder: string | null;
    lease_expires_at: string | null;
    idempotency_key: string;
  }>;
  const historyRows = (historyRowsRaw ?? []) as Array<{
    id: string;
    provider: string;
    campaign_name: string | null;
    promotion_id: string | null;
    status: string;
    error_message: string | null;
    created_at: string;
  }>;

  const registry = getProviderRegistry();
  const registryByKey = new Map(
    registry.listEntries().map((e) => [
      e.provider.key,
      {
        enabled: e.enabled,
        publishEnabled: e.provider.getCapabilities().publishEnabled && e.enabled,
        capsPublishEnabled: e.provider.getCapabilities().publishEnabled,
      },
    ]),
  );

  const providerKeys = new Set<string>([
    ...accountRows.map((a) => a.provider),
    ...jobFailRows.map((r) => r.provider),
    ...historyRows.map((r) => r.provider),
    ...[...registryByKey.keys()],
  ]);

  const providers: ProviderIntelRow[] = [...providerKeys]
    .filter((p) => !providerFilter || p === providerFilter)
    .sort()
    .map((provider) => {
      const acct = accountRows.find((a) => a.provider === provider) ?? null;
      const jobs = jobFailRows.filter((r) => r.provider === provider);
      const hist = historyRows.filter((r) => r.provider === provider);
      const reg = registryByKey.get(provider as never) ?? null;

      const successCount =
        hist.filter((h) => h.status === "published").length +
        jobs.filter((j) => j.status === "succeeded").length;
      const failureCount =
        hist.filter((h) => h.status === "failed").length +
        jobs.filter((j) => j.status === "dead_letter" || j.status === "retryable").length;
      const attempts = successCount + failureCount;

      const errorCategories: Record<string, number> = {};
      let authFailures = 0;
      let rateLimitFailures = 0;
      for (const j of jobs) {
        const cls = (j.failure_class ?? "unknown") as PublishFailureClass | "unknown";
        if (j.status === "dead_letter" || j.status === "retryable" || j.failure_class) {
          errorCategories[cls] = (errorCategories[cls] ?? 0) + 1;
        }
        if (cls === "auth") authFailures += 1;
        if (cls === "rate_limit") rateLimitFailures += 1;
      }

      const providerLatencies = jobs
        .filter((j) => j.status === "succeeded" && j.processed_at)
        .map((j) => {
          const start = Date.parse(j.created_at);
          const end = Date.parse(String(j.processed_at));
          return !Number.isNaN(start) && !Number.isNaN(end) && end >= start ? end - start : null;
        })
        .filter((n): n is number => n != null);

      const connected =
        acct?.status === "connected" ||
        acct?.health === "healthy" ||
        acct?.health === "degraded" ||
        attempts > 0;
      const unexpectedDisabled = Boolean(
        reg && connected && (!reg.enabled || !reg.publishEnabled) && attempts > 0,
      );

      return {
        provider,
        successCount,
        failureCount,
        attempts,
        successRate: rate(successCount, attempts),
        avgLatencyMs: avg(providerLatencies),
        errorCategories,
        authFailures,
        rateLimitFailures,
        connectionHealth: acct?.health ?? null,
        connectionStatus: acct?.status ?? null,
        lastPublishAt: acct?.last_publish_at ?? null,
        lastSync: acct?.last_sync ?? null,
        stale: acct
          ? isStaleConnection({
              status: acct.status,
              health: acct.health,
              lastSync: acct.last_sync,
              lastPublishAt: acct.last_publish_at,
              nowMs,
            })
          : false,
        providerEnabled: reg?.enabled ?? null,
        publishEnabled: reg?.publishEnabled ?? null,
        unexpectedDisabled,
      };
    });

  const campaignIntel = aggregateCampaignIntel([
    ...historyRows,
    ...jobFailRows.map((j) => ({
      campaign_name: j.campaign_name,
      promotion_id: j.promotion_id,
      status: j.status,
      provider: j.provider,
    })),
  ]);

  const contentCounts = await Promise.all(
    CONTENT_STATUSES.map(async (status) => {
      const n = await headCount(admin, "campaign_content", (q) => q.eq("status", status));
      return [status, n] as const;
    }),
  );
  const draftVsPublished = Object.fromEntries(contentCounts) as {
    draft: number;
    ready: number;
    published: number;
    archived: number;
  };

  const trendDays = Math.min(14, Math.ceil(windowHours / 24) + 7);
  const trends = buildDailyTrends(
    [
      ...historyRows.map((r) => ({ created_at: r.created_at, status: r.status })),
      ...jobFailRows.map((r) => ({
        created_at: r.created_at,
        status: r.status,
        attempts: r.attempts,
      })),
    ],
    trendDays,
    nowMs,
  );

  // --- Data quality probes (surfaced, never silently dropped) ---
  const succeededJobIds = jobFailRows.filter((j) => j.status === "succeeded").map((j) => j.id);
  let missingHistoryCount = 0;
  if (succeededJobIds.length > 0) {
    // Approximation: succeeded jobs in window vs published history count delta when jobs > history.
    missingHistoryCount = Math.max(0, jobsSucceededWindow - historyPublished);
  }

  const promotionIds = [
    ...new Set(
      jobFailRows
        .map((j) => j.promotion_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
  let orphanedJobCount = 0;
  if (promotionIds.length > 0) {
    const { data: promoRows } = await admin.from("promotions").select("id").in("id", promotionIds);
    const existing = new Set((promoRows ?? []).map((p) => String(p.id)));
    orphanedJobCount = jobFailRows.filter(
      (j) =>
        j.promotion_id &&
        !existing.has(j.promotion_id) &&
        ["queued", "leased", "retryable"].includes(j.status),
    ).length;
  }

  const invalidStateCount = jobFailRows.filter((j) => {
    if (j.status === "leased" && (!j.lease_holder || !j.lease_expires_at)) return true;
    if (j.status === "leased" && j.lease_expires_at) {
      const exp = Date.parse(j.lease_expires_at);
      return !Number.isNaN(exp) && exp < nowMs - INTEL_THRESHOLDS.leaseStuckMs;
    }
    return false;
  }).length;

  const accountProviders = new Set(accountRows.map((a) => a.provider));
  const missingProviderMappingCount = jobFailRows.filter(
    (j) =>
      ["queued", "leased", "retryable", "dead_letter"].includes(j.status) &&
      !accountProviders.has(j.provider),
  ).length;

  const activeKeyCounts = new Map<string, number>();
  for (const j of jobFailRows) {
    if (!["queued", "leased", "retryable"].includes(j.status)) continue;
    const key = `${j.provider}::${j.idempotency_key}`;
    activeKeyCounts.set(key, (activeKeyCounts.get(key) ?? 0) + 1);
  }
  const duplicateIdempotencyCount = [...activeKeyCounts.values()].filter((n) => n > 1).length;

  const inconsistentTimestampCount = jobFailRows.filter((j) => {
    const created = Date.parse(j.created_at);
    if (Number.isNaN(created)) return true;
    if (j.processed_at) {
      const processed = Date.parse(j.processed_at);
      if (!Number.isNaN(processed) && processed < created) return true;
    }
    if (j.dead_lettered_at) {
      const dlq = Date.parse(j.dead_lettered_at);
      if (!Number.isNaN(dlq) && dlq < created) return true;
    }
    return false;
  }).length;

  const invalidCapabilityProviders = [...registryByKey.entries()]
    .filter(([, v]) => v.enabled && !v.capsPublishEnabled)
    .map(([k]) => k);

  const dataQuality = evaluateDataQualityIssues({
    detectedAt,
    missingHistoryCount,
    orphanedJobCount,
    invalidStateCount,
    missingProviderMappingCount,
    duplicateIdempotencyCount,
    inconsistentTimestampCount,
    invalidCapabilityProviders,
  });

  const env =
    process.env.VERCEL_ENV ??
    process.env.NEXT_PUBLIC_VERCEL_ENV ??
    process.env.NODE_ENV ??
    "unknown";
  const workerHealth = await fetchCronRunHealth(admin, "process-social-publish-jobs", {
    staleAfterMinutes: INTEL_THRESHOLDS.publishWorkerStaleAfterMinutes,
    environment: env,
  });

  const operationalHealth: PublishIntelligenceSnapshot["operationalHealth"] = {
    ...rates,
    dlqCount: depth.dead_letter,
    queueDepth,
    avgPublishLatencyMs: latencyStats.avgMs,
    medianPublishLatencyMs: latencyStats.medianMs,
    p95PublishLatencyMs: latencyStats.p95Ms,
    retrySuccessRate,
    recoveryTimeMs: avg(recoveryLatencies),
    providerAvailability: rate(connectionHealthyCount, accountRows.length),
    connectionHealthyCount,
    connectionTotalCount: accountRows.length,
    staleConnections,
    jobsAwaitingRetry: depth.retryable,
    stuckLedgerProcessing: stuckLedger,
    oldestQueuedJobAt,
    oldestQueuedJobAgeMs,
    historyPublished,
    historyFailed,
  };

  const slis = buildServiceLevelIndicators({
    publishSuccessRate: operationalHealth.publishSuccessRate,
    medianLatencyMs: operationalHealth.medianPublishLatencyMs,
    p95LatencyMs: operationalHealth.p95PublishLatencyMs,
    oldestQueuedJobAgeMs,
    retrySuccessRate,
    recoveryTimeMs: operationalHealth.recoveryTimeMs,
  });

  const queue: PublishIntelligenceSnapshot["queue"] = {
    ...depth,
    processingRatePerHour: workerThroughput24h / 24,
    retryBacklog: depth.retryable,
    dlqGrowth24h,
    workerThroughput24h,
    workerStatus: workerHealth.status,
    workerLastSuccessAt: workerHealth.lastSuccessAt,
  };

  const alerts = buildOperationalAlerts({
    detectedAt,
    publishSuccessRate: operationalHealth.publishSuccessRate,
    published: historyPublished,
    failed: historyFailed,
    retryBacklog: depth.retryable,
    dlqCount: depth.dead_letter,
    dlqGrowth24h,
    oldestQueuedJobAgeMs,
    queueDepth,
    workerStatus: workerHealth.status,
    workerLastSuccessAt: workerHealth.lastSuccessAt,
    providers: providers.map((p) => ({
      provider: p.provider,
      authFailures: p.authFailures,
      attempts: p.attempts,
      connectionHealth: p.connectionHealth,
      connectionStatus: p.connectionStatus,
      unexpectedDisabled: p.unexpectedDisabled,
    })),
  });

  const recommendations = buildOperationalRecommendations({
    detectedAt,
    publishSuccessRate: operationalHealth.publishSuccessRate,
    failureRate: operationalHealth.failureRate,
    published: historyPublished,
    failed: historyFailed,
    retryBacklog: depth.retryable,
    dlqCount: depth.dead_letter,
    dlqGrowth24h,
    stuckLedgerProcessing: stuckLedger,
    oldestQueuedJobAgeMs,
    oldestQueuedJobAt,
    queueDepth,
    providers: providers.map((p) => ({
      provider: p.provider,
      authFailures: p.authFailures,
      rateLimitFailures: p.rateLimitFailures,
      attempts: p.attempts,
      connectionHealth: p.connectionHealth,
      connectionStatus: p.connectionStatus,
      stale: p.stale,
      lastSync: p.lastSync,
      lastPublishAt: p.lastPublishAt,
    })),
    repeatedFailures: campaignIntel.repeatedFailures,
    dataQualityCount: dataQuality.length,
  });

  const runbooks = Object.values(INTEL_RUNBOOKS).map((r) => ({
    id: r.id,
    title: r.title,
    href: r.href,
    summary: r.summary,
  }));

  const recentFailures = [
    ...historyRows
      .filter((h) => h.status === "failed")
      .slice(0, 20)
      .map((h) => ({
        id: h.id,
        source: "history" as const,
        provider: h.provider,
        campaignName: h.campaign_name,
        status: h.status,
        failureClass: null,
        errorMessage: h.error_message,
        correlationId: null,
        createdAt: h.created_at,
      })),
    ...jobFailRows
      .filter((j) => j.status === "dead_letter" || j.status === "retryable")
      .slice(0, 20)
      .map((j) => ({
        id: j.id,
        source: "job" as const,
        provider: j.provider,
        campaignName: j.campaign_name,
        status: j.status,
        failureClass: j.failure_class,
        errorMessage: j.last_error,
        correlationId: j.correlation_id,
        createdAt: j.created_at,
      })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 25);

  let dlqQuery = admin
    .from("social_publish_jobs")
    .select(
      "id, provider, campaign_name, failure_class, last_error, correlation_id, attempts, dead_lettered_at",
    )
    .eq("status", "dead_letter")
    .order("dead_lettered_at", { ascending: false, nullsFirst: false })
    .limit(25);
  if (providerFilter) dlqQuery = dlqQuery.eq("provider", providerFilter);
  if (campaignFilter) dlqQuery = dlqQuery.ilike("campaign_name", `%${campaignFilter}%`);
  const { data: dlqRows } = await dlqQuery;

  const dlqJobs = ((dlqRows ?? []) as Array<{
    id: string;
    provider: string;
    campaign_name: string | null;
    failure_class: string | null;
    last_error: string | null;
    correlation_id: string;
    attempts: number;
    dead_lettered_at: string | null;
  }>).map((j) => ({
    id: j.id,
    provider: j.provider,
    campaignName: j.campaign_name,
    failureClass: j.failure_class,
    lastError: j.last_error,
    correlationId: j.correlation_id,
    attempts: j.attempts,
    deadLetteredAt: j.dead_lettered_at,
  }));

  return {
    generatedAt: detectedAt,
    windowHours,
    filters: { provider: providerFilter, campaign: campaignFilter },
    operationalHealth,
    slis,
    queue,
    providers,
    campaigns: {
      mostSuccessful: campaignIntel.mostSuccessful,
      repeatedFailures: campaignIntel.repeatedFailures,
      draftVsPublished,
      providerDistribution: campaignIntel.providerDistribution,
    },
    trends,
    dataQuality,
    alerts,
    recommendations,
    runbooks,
    drilldown: { recentFailures, dlqJobs },
  };
}
