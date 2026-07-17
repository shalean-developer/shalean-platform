/**
 * MKT-001C + MKT-001B.2 — Provider-agnostic publishing service.
 *
 * Slice 1 path: durable enqueue → inline drain via shared executePublishJob.
 * Keeps backward-compatible PublishServiceOutcome / HTTP shapes for Hub clients.
 *
 * Does not weaken MKT-001A encryption/SSRF or MKT-001B reliability controls.
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  createPublishCorrelationId,
  fingerprintPublishPayload,
  logPublishEvent,
} from "@/lib/promotions/publishObservability";
import {
  enqueuePublishJob,
  executePublishJob,
  isLedgerProvider,
  leaseSpecificPublishJob,
  newPublishJobHolderId,
} from "@/lib/promotions/publishJobs";
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

export type PublishServiceSuccess = {
  ok: true;
  state: Extract<PublishState, "succeeded" | "idempotent_replay">;
  correlationId: string;
  result: Extract<PublishResult, { ok: true }>;
  idempotentReplay?: boolean;
  attempts?: number;
};

export type PublishServiceFailure = {
  ok: false;
  state: Extract<PublishState, "failed" | "rejected">;
  correlationId: string;
  httpStatus: number;
  body: Record<string, unknown>;
};

export type PublishServiceOutcome = PublishServiceSuccess | PublishServiceFailure;

export type RunPublishArgs = {
  providerKey: ProviderKey;
  request: PublishRequest;
  publishedBy: string;
  explicitIdempotencyKey?: string | null;
  correlationId?: string;
  /** Inject registry in tests. */
  registry?: ReturnType<typeof getProviderRegistry>;
};

function jsonFailure(
  correlationId: string,
  httpStatus: number,
  body: Record<string, unknown>,
  state: PublishServiceFailure["state"] = "rejected",
): PublishServiceFailure {
  return {
    ok: false,
    state,
    correlationId,
    httpStatus,
    body: { ...body, correlationId },
  };
}

/**
 * Execute a publish: durable enqueue + inline drain (Hub-responsive Slice 1 path).
 */
export async function runPublish(args: RunPublishArgs): Promise<PublishServiceOutcome> {
  const correlationId = args.correlationId ?? createPublishCorrelationId();
  const registry = args.registry ?? getProviderRegistry();

  let provider: SocialProvider;
  try {
    provider = registry.requireEnabled(args.providerKey);
  } catch (e) {
    if (e instanceof ProviderNotFoundError) {
      return jsonFailure(correlationId, 400, {
        error: e.message,
        classification: "validation",
        retryable: false,
        recoveryGuidance: "Use a supported provider key (facebook | google_business | instagram).",
      });
    }
    if (e instanceof ProviderDisabledError) {
      return jsonFailure(correlationId, 403, {
        error: e.message,
        classification: "permission",
        retryable: false,
        recoveryGuidance: `Enable ${e.featureFlag}=1 to allow this provider.`,
      });
    }
    throw e;
  }

  if (!isLedgerProvider(provider.key)) {
    return jsonFailure(correlationId, 501, {
      error: `${provider.displayName} publishing is not implemented.`,
      classification: "validation",
      retryable: false,
      recoveryGuidance: "This provider is registered as a stub only.",
    });
  }

  const content = provider.validateContent(args.request);
  if (!content.ok) {
    return jsonFailure(correlationId, 400, {
      error: content.error,
      classification: "validation",
      retryable: false,
      recoveryGuidance: "Fix the message, image, or link and try again.",
    });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    await logPublishEvent({
      level: "error",
      provider: provider.key,
      phase: "rejected",
      correlationId,
      outcome: "admin_unavailable",
      detail: "Supabase admin client unavailable; refusing publish.",
    });
    return jsonFailure(correlationId, 503, {
      error: "Publishing temporarily unavailable (idempotency ledger offline). Retry shortly.",
      classification: "provider_unavailable",
      retryable: true,
    });
  }

  const targetRef = await provider.resolveTargetRef();
  const message = args.request.message.trim();
  const payloadFp = fingerprintPublishPayload({
    message,
    link: args.request.link,
    promotionId: args.request.promotionId,
  });

  const enqueued = await enqueuePublishJob({
    admin,
    provider: provider.key,
    request: { ...args.request, message },
    publishedBy: args.publishedBy,
    targetRef,
    explicitIdempotencyKey: args.explicitIdempotencyKey,
    correlationId,
  });

  if (enqueued.outcome === "error") {
    await logPublishEvent({
      level: "error",
      provider: provider.key,
      phase: "rejected",
      correlationId,
      outcome: "enqueue_error",
      detail: enqueued.error,
      idempotencyKeyFingerprint: payloadFp,
    });
    return jsonFailure(correlationId, 503, {
      error: "Could not enqueue publish job. Retry shortly.",
      classification: "provider_unavailable",
      retryable: true,
    });
  }

  if (enqueued.outcome === "conflict") {
    return jsonFailure(correlationId, 409, {
      error: enqueued.error,
      classification: "conflict",
      retryable: false,
      recoveryGuidance:
        "Use a new Idempotency-Key header for a deliberate repost, or change the message/link.",
    });
  }

  let job = enqueued.job;

  // If the existing active job already succeeded terminal path returned as existing,
  // or is already leased by another worker — still try inline lease when queued/retryable.
  if (job.status === "succeeded") {
    const result: Extract<PublishResult, { ok: true }> = {
      ok: true,
      externalPostId: job.external_post_id ?? "",
      postId: job.external_post_id ?? undefined,
      postName: job.external_post_id ?? undefined,
    };
    return {
      ok: true,
      state: "idempotent_replay",
      correlationId: job.correlation_id || correlationId,
      idempotentReplay: true,
      result,
      attempts: job.attempts,
    };
  }

  const holder = newPublishJobHolderId();
  const leased =
    job.status === "leased" && job.lease_holder
      ? null
      : await leaseSpecificPublishJob(admin, job.id, holder);

  if (!leased) {
    // Another worker holds it, or not claimable — surface in-progress for Hub compatibility.
    if (job.status === "leased") {
      return jsonFailure(correlationId, 409, {
        error: "A publish for this content is already in progress.",
        classification: "conflict",
        retryable: true,
        retryAfterMs: 15_000,
        recoveryGuidance:
          "Wait for the in-progress publish to finish. The durable worker will retry automatically.",
      });
    }
    // Fall through: try execute if somehow already leased by us (shouldn't happen)
    return jsonFailure(correlationId, 409, {
      error: "A publish for this content is already in progress.",
      classification: "conflict",
      retryable: true,
      retryAfterMs: 15_000,
      recoveryGuidance:
        "Wait for the in-progress publish to finish. The durable worker will retry automatically.",
    });
  }

  job = leased;

  const executed = await executePublishJob({
    admin,
    job,
    ephemeralRequest: {
      imageDataUrl: args.request.imageDataUrl,
      imageUrl: args.request.imageUrl,
      providerPayload: args.request.providerPayload,
    },
    registry,
  });

  if (executed.serviceState === "succeeded" || executed.serviceState === "idempotent_replay") {
    return {
      ok: true,
      state: executed.serviceState,
      correlationId: executed.correlationId,
      idempotentReplay: executed.idempotentReplay,
      attempts: executed.job.attempts,
      result: executed.result!,
    };
  }

  return jsonFailure(
    executed.correlationId,
    executed.httpStatus,
    executed.body,
    executed.serviceState === "failed" ? "failed" : "rejected",
  );
}

/** Map service outcome to a stable HTTP JSON body for route handlers. */
export function publishOutcomeToHttp(outcome: PublishServiceOutcome): {
  status: number;
  body: Record<string, unknown>;
} {
  if (!outcome.ok) {
    return { status: outcome.httpStatus, body: outcome.body };
  }

  if (outcome.idempotentReplay) {
    return {
      status: 200,
      body: {
        ok: true,
        postId: outcome.result.postId ?? outcome.result.externalPostId,
        postName: outcome.result.postName ?? outcome.result.externalPostId,
        idempotentReplay: true,
        correlationId: outcome.correlationId,
      },
    };
  }

  return {
    status: 200,
    body: {
      ok: true,
      postId: outcome.result.postId ?? outcome.result.externalPostId,
      photoId: outcome.result.photoId ?? null,
      postName: outcome.result.postName ?? outcome.result.externalPostId,
      searchUrl: outcome.result.searchUrl ?? null,
      correlationId: outcome.correlationId,
    },
  };
}
