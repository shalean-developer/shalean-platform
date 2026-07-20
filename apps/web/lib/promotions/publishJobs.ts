/**
 * MKT-001B.2 — Durable social publish job queue (execution layer).
 *
 * Ledger (`marketing_publish_idempotency`) remains logical dedupe SoT.
 * Provider I/O goes only through SocialProvider.publish.
 */

import "server-only";

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimPublish,
  computeRequestHash,
  markPublishFailed,
  markPublishSucceeded,
  resolveIdempotencyKey,
  type PublishProvider,
} from "@/lib/promotions/publishIdempotency";
import {
  computePublishJobBackoffMs,
  nextAttemptAtIso,
  PUBLISH_JOB_DEFAULT_MAX_ATTEMPTS,
} from "@/lib/promotions/publishJobBackoff";
import {
  createPublishCorrelationId,
  fingerprintPublishPayload,
  logPublishEvent,
} from "@/lib/promotions/publishObservability";
import { publishFailureResponseBody } from "@/lib/promotions/publishProviderErrors";
import {
  getProviderRegistry,
  ProviderDisabledError,
  ProviderNotFoundError,
} from "@/lib/promotions/providers/registry";
import type {
  ProviderKey,
  PublishRequest,
  PublishResult,
  PublishState,
  SocialProvider,
} from "@/lib/promotions/providers/types";

const UNIQUE_VIOLATION = "23505";
const LEDGER_PROVIDERS = new Set<ProviderKey>(["facebook", "google_business", "instagram", "x"]);
const ACTIVE_STATUSES = new Set(["queued", "leased", "retryable"]);

export type SocialPublishJobStatus =
  | "queued"
  | "leased"
  | "retryable"
  | "succeeded"
  | "dead_letter"
  | "cancelled";

/** Durable payload — never includes secrets, tokens, or raw imageDataUrl. */
export type SanitizedPublishJobPayload = {
  message: string;
  link?: string | null;
  promotionId?: string | null;
  campaignName?: string | null;
  imageUrl?: string | null;
};

export type SocialPublishJobRow = {
  id: string;
  provider: PublishProvider;
  idempotency_key: string;
  request_hash: string;
  target_ref: string | null;
  promotion_id: string | null;
  campaign_name: string | null;
  payload: SanitizedPublishJobPayload;
  published_by: string;
  correlation_id: string;
  status: SocialPublishJobStatus;
  scheduled_for: string;
  next_attempt_at: string | null;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  failure_class: string | null;
  retryable: boolean | null;
  external_post_id: string | null;
  ledger_id: string | null;
  lease_holder: string | null;
  lease_expires_at: string | null;
  dead_lettered_at: string | null;
  replayed_from_job_id: string | null;
  cancelled_at: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

export function isLedgerProvider(key: ProviderKey): key is PublishProvider {
  return LEDGER_PROVIDERS.has(key);
}

/**
 * Strip secrets / raw media bytes / opaque provider blobs before persistence.
 */
export function sanitizePublishJobPayload(request: PublishRequest): SanitizedPublishJobPayload {
  const imageUrl =
    typeof request.imageUrl === "string" && request.imageUrl.trim()
      ? request.imageUrl.trim().slice(0, 2000)
      : null;
  return {
    message: (request.message ?? "").trim().slice(0, 10_000),
    link: typeof request.link === "string" && request.link.trim() ? request.link.trim().slice(0, 2000) : null,
    promotionId: request.promotionId ?? null,
    campaignName:
      typeof request.campaignName === "string" && request.campaignName.trim()
        ? request.campaignName.trim().slice(0, 500)
        : null,
    imageUrl,
  };
}

export function payloadToPublishRequest(
  payload: SanitizedPublishJobPayload,
  ephemeral?: Partial<PublishRequest> | null,
): PublishRequest {
  return {
    message: payload.message,
    link: payload.link,
    promotionId: payload.promotionId,
    campaignName: payload.campaignName,
    imageUrl: ephemeral?.imageUrl ?? payload.imageUrl,
    imageDataUrl: ephemeral?.imageDataUrl ?? null,
    providerPayload: ephemeral?.providerPayload,
  };
}

function asJobRow(data: Record<string, unknown>): SocialPublishJobRow {
  const payloadRaw = (data.payload ?? {}) as SanitizedPublishJobPayload;
  return {
    id: String(data.id),
    provider: data.provider as PublishProvider,
    idempotency_key: String(data.idempotency_key),
    request_hash: String(data.request_hash),
    target_ref: (data.target_ref as string | null) ?? null,
    promotion_id: (data.promotion_id as string | null) ?? null,
    campaign_name: (data.campaign_name as string | null) ?? null,
    payload: {
      message: String(payloadRaw.message ?? ""),
      link: payloadRaw.link ?? null,
      promotionId: payloadRaw.promotionId ?? null,
      campaignName: payloadRaw.campaignName ?? null,
      imageUrl: payloadRaw.imageUrl ?? null,
    },
    published_by: String(data.published_by ?? ""),
    correlation_id: String(data.correlation_id ?? ""),
    status: data.status as SocialPublishJobStatus,
    scheduled_for: String(data.scheduled_for),
    next_attempt_at: (data.next_attempt_at as string | null) ?? null,
    attempts: typeof data.attempts === "number" ? data.attempts : 0,
    max_attempts:
      typeof data.max_attempts === "number" ? data.max_attempts : PUBLISH_JOB_DEFAULT_MAX_ATTEMPTS,
    last_error: (data.last_error as string | null) ?? null,
    failure_class: (data.failure_class as string | null) ?? null,
    retryable: typeof data.retryable === "boolean" ? data.retryable : null,
    external_post_id: (data.external_post_id as string | null) ?? null,
    ledger_id: (data.ledger_id as string | null) ?? null,
    lease_holder: (data.lease_holder as string | null) ?? null,
    lease_expires_at: (data.lease_expires_at as string | null) ?? null,
    dead_lettered_at: (data.dead_lettered_at as string | null) ?? null,
    replayed_from_job_id: (data.replayed_from_job_id as string | null) ?? null,
    cancelled_at: (data.cancelled_at as string | null) ?? null,
    processed_at: (data.processed_at as string | null) ?? null,
    created_at: String(data.created_at),
    updated_at: String(data.updated_at),
  };
}

export type EnqueuePublishJobArgs = {
  admin: SupabaseClient;
  provider: PublishProvider;
  request: PublishRequest;
  publishedBy: string;
  targetRef: string | null;
  explicitIdempotencyKey?: string | null;
  correlationId?: string;
  scheduledFor?: string | null;
  maxAttempts?: number;
  replayedFromJobId?: string | null;
};

export type EnqueuePublishJobResult =
  | { outcome: "enqueued"; job: SocialPublishJobRow; created: true }
  | { outcome: "existing_active"; job: SocialPublishJobRow; created: false }
  | { outcome: "conflict"; error: string }
  | { outcome: "error"; error: string };

/**
 * Durable enqueue. Duplicate active (provider, idempotency_key) returns the existing job.
 */
export async function enqueuePublishJob(args: EnqueuePublishJobArgs): Promise<EnqueuePublishJobResult> {
  const payload = sanitizePublishJobPayload(args.request);
  const identity = {
    provider: args.provider,
    targetRef: args.targetRef,
    promotionId: args.request.promotionId ?? null,
    message: payload.message,
    link: payload.link,
    explicitKey: args.explicitIdempotencyKey,
  };
  const requestHash = computeRequestHash(identity);
  const idempotencyKey = resolveIdempotencyKey(identity, requestHash);
  const correlationId = args.correlationId ?? createPublishCorrelationId();
  const now = new Date().toISOString();

  const insert = await args.admin
    .from("social_publish_jobs")
    .insert({
      provider: args.provider,
      idempotency_key: idempotencyKey,
      request_hash: requestHash,
      target_ref: args.targetRef,
      promotion_id: args.request.promotionId ?? null,
      campaign_name: payload.campaignName ?? null,
      payload,
      published_by: args.publishedBy,
      correlation_id: correlationId,
      status: "queued",
      scheduled_for: args.scheduledFor ?? now,
      attempts: 0,
      max_attempts: args.maxAttempts ?? PUBLISH_JOB_DEFAULT_MAX_ATTEMPTS,
      replayed_from_job_id: args.replayedFromJobId ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (!insert.error && insert.data) {
    const job = asJobRow(insert.data as Record<string, unknown>);
    await logPublishEvent({
      provider: args.provider,
      phase: "claim",
      correlationId,
      outcome: "job_enqueued",
      publishId: job.id,
      idempotencyKeyFingerprint: fingerprintPublishPayload({
        message: payload.message,
        link: payload.link,
        promotionId: payload.promotionId,
      }),
    });
    return { outcome: "enqueued", job, created: true };
  }

  if (insert.error && insert.error.code !== UNIQUE_VIOLATION) {
    return { outcome: "error", error: insert.error.message };
  }

  const existing = await args.admin
    .from("social_publish_jobs")
    .select("*")
    .eq("provider", args.provider)
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["queued", "leased", "retryable"])
    .maybeSingle();

  if (existing.error) {
    return { outcome: "error", error: existing.error.message };
  }
  if (!existing.data) {
    const terminal = await args.admin
      .from("social_publish_jobs")
      .select("*")
      .eq("provider", args.provider)
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (terminal.error || !terminal.data) {
      return {
        outcome: "error",
        error: terminal.error?.message ?? "Enqueue conflict lookup failed.",
      };
    }
    const termJob = asJobRow(terminal.data as Record<string, unknown>);
    if (termJob.request_hash !== requestHash) {
      return { outcome: "conflict", error: "Idempotency key reused with different content." };
    }
    return { outcome: "existing_active", job: termJob, created: false };
  }

  const job = asJobRow(existing.data as Record<string, unknown>);
  if (job.request_hash !== requestHash) {
    return { outcome: "conflict", error: "Idempotency key reused with different content." };
  }
  return { outcome: "existing_active", job, created: false };
}

export type ClaimJobsResult = {
  jobs: SocialPublishJobRow[];
  via: "rpc" | "fallback";
  error?: string;
};

/**
 * Claim due jobs. Prefers SKIP LOCKED RPC; falls back to select+CAS.
 */
export async function claimDuePublishJobs(
  admin: SupabaseClient,
  opts: { limit?: number; holder: string; leaseSeconds?: number },
): Promise<ClaimJobsResult> {
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
  const leaseSeconds = Math.max(30, Math.min(opts.leaseSeconds ?? 120, 600));

  const rpc = await admin.rpc("claim_social_publish_jobs", {
    p_limit: limit,
    p_holder: opts.holder,
    p_lease_seconds: leaseSeconds,
  });

  if (!rpc.error && Array.isArray(rpc.data)) {
    return {
      jobs: (rpc.data as Record<string, unknown>[]).map(asJobRow),
      via: "rpc",
    };
  }

  const nowIso = new Date().toISOString();
  const listed = await admin
    .from("social_publish_jobs")
    .select("*")
    .in("status", ["queued", "retryable"])
    .lte("scheduled_for", nowIso)
    .order("scheduled_for", { ascending: true })
    .limit(limit * 3);

  if (listed.error) {
    return { jobs: [], via: "fallback", error: listed.error.message ?? rpc.error?.message };
  }

  const candidates = ((listed.data ?? []) as Record<string, unknown>[])
    .map(asJobRow)
    .filter((j) => {
      if (j.attempts >= j.max_attempts) return false;
      if (j.next_attempt_at) {
        const t = Date.parse(j.next_attempt_at);
        if (Number.isFinite(t) && t > Date.now()) return false;
      }
      return true;
    })
    .slice(0, limit);

  const claimed: SocialPublishJobRow[] = [];
  for (const c of candidates) {
    const upd = await admin
      .from("social_publish_jobs")
      .update({
        status: "leased",
        lease_holder: opts.holder,
        lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
        attempts: c.attempts + 1,
        next_attempt_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", c.id)
      .in("status", ["queued", "retryable"])
      .select("*")
      .maybeSingle();
    if (!upd.error && upd.data) {
      claimed.push(asJobRow(upd.data as Record<string, unknown>));
    }
  }

  return {
    jobs: claimed,
    via: "fallback",
    error: rpc.error?.message,
  };
}

export async function recoverExpiredPublishJobLeases(
  admin: SupabaseClient,
  opts?: { limit?: number },
): Promise<{ recovered: number; error?: string }> {
  const limit = opts?.limit ?? 100;
  const rpc = await admin.rpc("recover_expired_social_publish_leases", { p_limit: limit });
  if (!rpc.error && typeof rpc.data === "number") {
    return { recovered: rpc.data };
  }

  const nowIso = new Date().toISOString();
  const listed = await admin
    .from("social_publish_jobs")
    .select("id")
    .eq("status", "leased")
    .lt("lease_expires_at", nowIso)
    .limit(limit);

  if (listed.error) {
    return { recovered: 0, error: listed.error.message ?? rpc.error?.message };
  }

  let recovered = 0;
  for (const row of (listed.data ?? []) as Array<{ id: string }>) {
    const upd = await admin
      .from("social_publish_jobs")
      .update({
        status: "queued",
        lease_holder: null,
        lease_expires_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "leased")
      .select("id")
      .maybeSingle();
    if (!upd.error && upd.data) recovered += 1;
  }
  return { recovered, error: rpc.error?.message };
}

async function recordPublishHistory(args: {
  admin: SupabaseClient;
  provider: PublishProvider;
  status: "published" | "failed";
  responseId?: string | null;
  error?: string | null;
  promotionId?: string | null;
  campaignName?: string | null;
  publishedBy: string;
}) {
  try {
    await args.admin.from("social_publish_history").insert({
      provider: args.provider,
      promotion_id: args.promotionId ?? null,
      campaign_name: args.campaignName ?? null,
      status: args.status,
      response_id: args.responseId ?? null,
      api_response: { fingerprinted: true },
      error_message: args.error ? args.error.slice(0, 2000) : null,
      published_by: args.publishedBy,
    });
  } catch {
    // best-effort
  }
}

export type ExecutePublishJobArgs = {
  admin: SupabaseClient;
  job: SocialPublishJobRow;
  ephemeralRequest?: Partial<PublishRequest> | null;
  registry?: ReturnType<typeof getProviderRegistry>;
  random?: () => number;
};

export type ExecutePublishJobResult = {
  job: SocialPublishJobRow;
  serviceState: Extract<PublishState, "succeeded" | "idempotent_replay" | "failed" | "rejected">;
  correlationId: string;
  httpStatus: number;
  body: Record<string, unknown>;
  result?: Extract<PublishResult, { ok: true }>;
  idempotentReplay?: boolean;
  providerCalled: boolean;
};

async function loadJob(admin: SupabaseClient, id: string): Promise<SocialPublishJobRow | null> {
  const res = await admin.from("social_publish_jobs").select("*").eq("id", id).maybeSingle();
  if (res.error || !res.data) return null;
  return asJobRow(res.data as Record<string, unknown>);
}

async function updateJob(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  expectedStatus?: SocialPublishJobStatus | SocialPublishJobStatus[],
  /** When completing/failing a leased job, require this holder so expired workers cannot overwrite. */
  leaseHolder?: string | null,
): Promise<SocialPublishJobRow | null> {
  let q = admin
    .from("social_publish_jobs")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (expectedStatus) {
    if (Array.isArray(expectedStatus)) {
      q = q.in("status", expectedStatus);
    } else {
      q = q.eq("status", expectedStatus);
    }
  }
  if (leaseHolder) {
    q = q.eq("lease_holder", leaseHolder);
  }
  const res = await q.select("*").maybeSingle();
  if (res.error || !res.data) return null;
  return asJobRow(res.data as Record<string, unknown>);
}

/**
 * Persist provider success id without requiring lease ownership.
 * First non-null writer wins — prevents double-post even if the original lease expired.
 */
async function persistExternalPostId(
  admin: SupabaseClient,
  id: string,
  externalPostId: string,
): Promise<SocialPublishJobRow | null> {
  const res = await admin
    .from("social_publish_jobs")
    .update({
      external_post_id: externalPostId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .is("external_post_id", null)
    .select("*")
    .maybeSingle();
  if (!res.error && res.data) {
    return asJobRow(res.data as Record<string, unknown>);
  }
  // Already set (possibly by us or a racing ack) — reload.
  return loadJob(admin, id);
}

/**
 * Execute a leased job. If external_post_id is already known, never calls the provider.
 */
export async function executePublishJob(args: ExecutePublishJobArgs): Promise<ExecutePublishJobResult> {
  const registry = args.registry ?? getProviderRegistry();
  let job = args.job;
  const leaseHolder = job.lease_holder;
  const correlationId = job.correlation_id || createPublishCorrelationId();
  const startedAt = Date.now();
  let providerCalled = false;

  const updateLeased = (patch: Record<string, unknown>) =>
    updateJob(args.admin, job.id, patch, "leased", leaseHolder);

  const reject = async (
    httpStatus: number,
    body: Record<string, unknown>,
    state: ExecutePublishJobResult["serviceState"] = "rejected",
  ): Promise<ExecutePublishJobResult> => ({
    job,
    serviceState: state,
    correlationId,
    httpStatus,
    body: { ...body, correlationId },
    providerCalled,
  });

  let provider: SocialProvider;
  try {
    provider = registry.requireEnabled(job.provider);
  } catch (e) {
    if (e instanceof ProviderNotFoundError || e instanceof ProviderDisabledError) {
      const updated = await updateLeased({
        status: "dead_letter",
        last_error: e.message,
        failure_class: "permission",
        retryable: false,
        dead_lettered_at: new Date().toISOString(),
        processed_at: new Date().toISOString(),
        lease_holder: null,
        lease_expires_at: null,
      });
      if (updated) job = updated;
      return reject(403, { error: e.message, classification: "permission", retryable: false }, "rejected");
    }
    throw e;
  }

  if (job.external_post_id) {
    if (job.ledger_id) {
      await markPublishSucceeded(args.admin, job.ledger_id, job.external_post_id);
    } else {
      const claim = await claimPublish(
        args.admin,
        {
          provider: job.provider,
          targetRef: job.target_ref,
          promotionId: job.promotion_id,
          message: job.payload.message,
          link: job.payload.link,
          explicitKey: job.idempotency_key === job.request_hash ? null : job.idempotency_key,
        },
        job.published_by,
      );
      if (claim.outcome === "claimed" || claim.outcome === "retry") {
        await markPublishSucceeded(args.admin, claim.id, job.external_post_id);
      }
    }
    const updated = await updateLeased({
      status: "succeeded",
      processed_at: new Date().toISOString(),
      lease_holder: null,
      lease_expires_at: null,
      last_error: null,
    });
    if (updated) job = updated;
    await logPublishEvent({
      provider: job.provider,
      phase: "ledger_success",
      correlationId,
      publishId: job.id,
      outcome: "ack_only_external_post_id",
      providerResponseId: job.external_post_id,
      attempts: job.attempts,
      latencyMs: Date.now() - startedAt,
    });
    const externalId = job.external_post_id ?? "";
    const result: Extract<PublishResult, { ok: true }> = {
      ok: true,
      externalPostId: externalId,
      postId: externalId,
      postName: externalId,
    };
    return {
      job,
      serviceState: "idempotent_replay",
      correlationId,
      httpStatus: 200,
      body: {
        ok: true,
        postId: result.postId,
        postName: result.postName,
        idempotentReplay: true,
        correlationId,
      },
      result,
      idempotentReplay: true,
      providerCalled: false,
    };
  }

  const request = payloadToPublishRequest(job.payload, args.ephemeralRequest);
  const content = provider.validateContent(request);
  if (!content.ok) {
    const updated = await updateLeased({
      status: "dead_letter",
      last_error: content.error,
      failure_class: "validation",
      retryable: false,
      dead_lettered_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      lease_holder: null,
      lease_expires_at: null,
    });
    if (updated) job = updated;
    return reject(
      400,
      {
        error: content.error,
        classification: "validation",
        retryable: false,
        recoveryGuidance: "Fix the message, image, or link and try again.",
      },
      "failed",
    );
  }

  const claim = await claimPublish(
    args.admin,
    {
      provider: job.provider,
      targetRef: job.target_ref,
      promotionId: job.promotion_id,
      message: job.payload.message,
      link: job.payload.link,
      explicitKey: job.idempotency_key === job.request_hash ? null : job.idempotency_key,
    },
    job.published_by,
  );

  if (claim.outcome === "duplicate_succeeded") {
    const updated = await updateLeased({
      status: "succeeded",
      external_post_id: claim.externalPostId,
      processed_at: new Date().toISOString(),
      lease_holder: null,
      lease_expires_at: null,
    });
    if (updated) job = updated;
    const result: Extract<PublishResult, { ok: true }> = {
      ok: true,
      externalPostId: claim.externalPostId ?? "",
      postId: claim.externalPostId ?? undefined,
      postName: claim.externalPostId ?? undefined,
    };
    return {
      job,
      serviceState: "idempotent_replay",
      correlationId,
      httpStatus: 200,
      body: {
        ok: true,
        postId: result.postId,
        postName: result.postName,
        idempotentReplay: true,
        correlationId,
      },
      result,
      idempotentReplay: true,
      providerCalled: false,
    };
  }

  if (claim.outcome === "in_progress") {
    const delay = computePublishJobBackoffMs({
      attemptsAfterFailure: 1,
      retryAfterMs: 15_000,
      random: args.random ?? (() => 0.5),
    });
    const updated = await updateLeased({
      status: "retryable",
      next_attempt_at: nextAttemptAtIso(delay),
      last_error: "Ledger publish already in progress.",
      failure_class: "conflict",
      retryable: true,
      lease_holder: null,
      lease_expires_at: null,
    });
    if (updated) job = updated;
    return reject(
      409,
      {
        error: "A publish for this content is already in progress.",
        classification: "conflict",
        retryable: true,
        retryAfterMs: delay,
      },
      "failed",
    );
  }

  if (claim.outcome === "conflict") {
    const updated = await updateLeased({
      status: "dead_letter",
      last_error: "Idempotency key reused with different content.",
      failure_class: "conflict",
      retryable: false,
      dead_lettered_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      lease_holder: null,
      lease_expires_at: null,
    });
    if (updated) job = updated;
    return reject(
      409,
      {
        error: "This idempotency key was already used with different content.",
        classification: "conflict",
        retryable: false,
      },
      "failed",
    );
  }

  if (claim.outcome === "error") {
    const delay = computePublishJobBackoffMs({
      attemptsAfterFailure: Math.max(1, job.attempts),
      retryAfterMs: 15_000,
      random: args.random ?? (() => 0.5),
    });
    const updated = await updateLeased({
      status: "retryable",
      next_attempt_at: nextAttemptAtIso(delay),
      last_error: claim.error.slice(0, 2000),
      failure_class: "provider_unavailable",
      retryable: true,
      lease_holder: null,
      lease_expires_at: null,
    });
    if (updated) job = updated;
    return reject(
      503,
      {
        error: "Could not claim publish idempotency. Retry shortly.",
        classification: "provider_unavailable",
        retryable: true,
      },
      "failed",
    );
  }

  const claimId = claim.id;
  await updateLeased({ ledger_id: claimId });

  await logPublishEvent({
    provider: job.provider,
    phase: "provider_call",
    correlationId,
    publishId: job.id,
    attempts: job.attempts,
  });

  providerCalled = true;
  const providerStarted = Date.now();
  const result = await provider.publish({ ...request, message: request.message.trim() });

  if (!result.ok) {
    const failure = provider.classifyError({
      httpStatus: result.status,
      rawMessage: result.error,
    });
    await markPublishFailed(args.admin, claimId, result.error);
    await recordPublishHistory({
      admin: args.admin,
      provider: job.provider,
      status: "failed",
      error: result.error,
      promotionId: job.promotion_id,
      campaignName: job.campaign_name,
      publishedBy: job.published_by,
    });

    const exhausted = job.attempts >= job.max_attempts;
    const toDead = !failure.retryable || exhausted;
    const delay = computePublishJobBackoffMs({
      attemptsAfterFailure: Math.max(1, job.attempts),
      retryAfterMs: failure.retryAfterMs,
      random: args.random ?? (() => 0.5),
    });

    const updated = await updateLeased(
      toDead
        ? {
            status: "dead_letter",
            last_error: result.error.slice(0, 2000),
            failure_class: failure.classification,
            retryable: failure.retryable,
            dead_lettered_at: new Date().toISOString(),
            processed_at: new Date().toISOString(),
            lease_holder: null,
            lease_expires_at: null,
          }
        : {
            status: "retryable",
            next_attempt_at: nextAttemptAtIso(delay),
            last_error: result.error.slice(0, 2000),
            failure_class: failure.classification,
            retryable: true,
            lease_holder: null,
            lease_expires_at: null,
          },
    );
    if (updated) job = updated;

    await logPublishEvent({
      level: "error",
      provider: job.provider,
      phase: "provider_result",
      correlationId,
      publishId: job.id,
      outcome: toDead ? "dead_letter" : "retryable",
      classification: failure.classification,
      retryable: failure.retryable,
      httpStatus: failure.httpStatus,
      latencyMs: Date.now() - providerStarted,
      attempts: job.attempts,
      detail: failure.userMessage,
    });

    return {
      job,
      serviceState: "failed",
      correlationId,
      httpStatus: failure.httpStatus,
      body: {
        ...(publishFailureResponseBody(failure) as unknown as Record<string, unknown>),
        correlationId,
      },
      providerCalled,
    };
  }

  const externalId = result.externalPostId?.trim() ?? "";
  if (!externalId || externalId === "unknown") {
    const err =
      "Provider reported success without a confirmed external post id — publish was not finalized.";
    await markPublishFailed(args.admin, claimId, err);
    await recordPublishHistory({
      admin: args.admin,
      provider: job.provider,
      status: "failed",
      error: err,
      promotionId: job.promotion_id,
      campaignName: job.campaign_name,
      publishedBy: job.published_by,
    });
    const updated = await updateLeased({
      status: "dead_letter",
      last_error: err.slice(0, 2000),
      failure_class: "validation",
      retryable: false,
      dead_lettered_at: new Date().toISOString(),
      processed_at: new Date().toISOString(),
      lease_holder: null,
      lease_expires_at: null,
    });
    if (updated) job = updated;
    return {
      job,
      serviceState: "failed",
      correlationId,
      httpStatus: 502,
      body: {
        error: err,
        classification: "validation",
        retryable: false,
        correlationId,
      },
      providerCalled,
    };
  }

  // Persist external id without lease ownership — first writer wins (replay-safe).
  if (result.externalPostId) {
    const withExt = await persistExternalPostId(args.admin, job.id, result.externalPostId);
    if (withExt) job = withExt;
  }

  await markPublishSucceeded(args.admin, claimId, result.externalPostId ?? null);
  await recordPublishHistory({
    admin: args.admin,
    provider: job.provider,
    status: "published",
    responseId: result.externalPostId,
    promotionId: job.promotion_id,
    campaignName: job.campaign_name,
    publishedBy: job.published_by,
  });

  const succeeded = await updateLeased({
    status: "succeeded",
    processed_at: new Date().toISOString(),
    lease_holder: null,
    lease_expires_at: null,
    last_error: null,
  });
  if (succeeded) job = succeeded;
  // If lease was lost, external_post_id is still persisted; replacement worker ack-only path applies.

  await logPublishEvent({
    provider: job.provider,
    phase: "ledger_success",
    correlationId,
    publishId: job.id,
    providerResponseId: result.externalPostId,
    latencyMs: Date.now() - startedAt,
    attempts: job.attempts,
  });

  if (provider.afterPublishSuccess) {
    await provider.afterPublishSuccess({
      request,
      result,
      publishedBy: job.published_by,
      correlationId,
    });
  }

  return {
    job,
    serviceState: "succeeded",
    correlationId,
    httpStatus: 200,
    body: {
      ok: true,
      postId: result.postId ?? result.externalPostId,
      photoId: result.photoId ?? null,
      postName: result.postName ?? result.externalPostId,
      searchUrl: result.searchUrl ?? null,
      correlationId,
    },
    result,
    providerCalled,
  };
}

/** Lease a specific job for inline drain (CAS + attempts++). */
export async function leaseSpecificPublishJob(
  admin: SupabaseClient,
  jobId: string,
  holder: string,
  leaseSeconds = 120,
): Promise<SocialPublishJobRow | null> {
  const cur = await loadJob(admin, jobId);
  if (!cur) return null;
  if (cur.status === "leased" && cur.lease_holder === holder) return cur;
  if (cur.status !== "queued" && cur.status !== "retryable") return null;

  const upd = await admin
    .from("social_publish_jobs")
    .update({
      status: "leased",
      lease_holder: holder,
      lease_expires_at: new Date(Date.now() + leaseSeconds * 1000).toISOString(),
      attempts: cur.attempts + 1,
      next_attempt_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", cur.status)
    .select("*")
    .maybeSingle();

  if (upd.error || !upd.data) return null;
  return asJobRow(upd.data as Record<string, unknown>);
}

export type ReplayDeadLetterArgs = {
  admin: SupabaseClient;
  jobId: string;
  actor: string;
};

export type ReplayDeadLetterResult =
  | { ok: true; job: SocialPublishJobRow; idempotent: boolean; reason?: string }
  | { ok: false; error: string; httpStatus: number };

/**
 * Explicit admin DLQ replay. Idempotent when already succeeded/active or external_post_id set.
 */
export async function replayDeadLetterJob(args: ReplayDeadLetterArgs): Promise<ReplayDeadLetterResult> {
  const source = await loadJob(args.admin, args.jobId);
  if (!source) {
    return { ok: false, error: "Job not found.", httpStatus: 404 };
  }
  if (source.status !== "dead_letter") {
    if (source.status === "succeeded") {
      return { ok: true, job: source, idempotent: true, reason: "already_succeeded" };
    }
    if (ACTIVE_STATUSES.has(source.status)) {
      return { ok: true, job: source, idempotent: true, reason: "already_active" };
    }
    return { ok: false, error: `Job status ${source.status} cannot be replayed.`, httpStatus: 409 };
  }

  if (source.external_post_id) {
    const fixed = await updateJob(args.admin, source.id, {
      status: "succeeded",
      processed_at: new Date().toISOString(),
      last_error: null,
    });
    return {
      ok: true,
      job: fixed ?? source,
      idempotent: true,
      reason: "external_post_id_present",
    };
  }

  const enq = await enqueuePublishJob({
    admin: args.admin,
    provider: source.provider,
    request: payloadToPublishRequest(source.payload),
    publishedBy: args.actor,
    targetRef: source.target_ref,
    explicitIdempotencyKey:
      source.idempotency_key === source.request_hash ? null : source.idempotency_key,
    correlationId: createPublishCorrelationId(),
    replayedFromJobId: source.id,
  });

  if (enq.outcome === "error") {
    return { ok: false, error: enq.error, httpStatus: 503 };
  }
  if (enq.outcome === "conflict") {
    return { ok: false, error: enq.error, httpStatus: 409 };
  }
  return {
    ok: true,
    job: enq.job,
    idempotent: !enq.created,
    reason: enq.created ? "replay_enqueued" : "existing_active",
  };
}

export function newPublishJobHolderId(): string {
  return randomUUID();
}
