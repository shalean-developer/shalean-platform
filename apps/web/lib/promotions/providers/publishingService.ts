/**
 * MKT-001C — Provider-agnostic publishing service.
 *
 * Owns: correlation, fail-closed idempotency claim, observability, history,
 * ledger success/failure. Providers only perform provider I/O.
 *
 * Does not weaken MKT-001A encryption/SSRF or MKT-001B reliability controls.
 */

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  claimPublish,
  markPublishFailed,
  markPublishSucceeded,
  type PublishProvider,
} from "@/lib/promotions/publishIdempotency";
import { publishFailureResponseBody } from "@/lib/promotions/publishProviderErrors";
import {
  createPublishCorrelationId,
  fingerprintPublishPayload,
  logPublishEvent,
} from "@/lib/promotions/publishObservability";
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

const LEDGER_PROVIDERS = new Set<ProviderKey>(["facebook", "google_business"]);

function isLedgerProvider(key: ProviderKey): key is PublishProvider {
  return LEDGER_PROVIDERS.has(key);
}

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

async function recordPublishHistory(args: {
  provider: PublishProvider;
  status: "published" | "failed";
  responseId?: string | null;
  error?: string | null;
  apiResponse?: Record<string, unknown>;
  promotionId?: string | null;
  campaignName?: string | null;
  publishedBy: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from("social_publish_history").insert({
      provider: args.provider,
      promotion_id: args.promotionId ?? null,
      campaign_name: args.campaignName ?? null,
      status: args.status,
      response_id: args.responseId ?? null,
      api_response: args.apiResponse ?? {},
      error_message: args.error ?? null,
      published_by: args.publishedBy,
    });
  } catch {
    // best-effort audit trail
  }
}

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
 * Execute a publish through the provider registry with MKT-001A/B controls.
 */
export async function runPublish(args: RunPublishArgs): Promise<PublishServiceOutcome> {
  const correlationId = args.correlationId ?? createPublishCorrelationId();
  const startedAt = Date.now();
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
        recoveryGuidance: "Use a supported provider key (facebook | google_business).",
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

  const ledgerProvider: PublishProvider = provider.key;
  const content = provider.validateContent(args.request);
  if (!content.ok) {
    return jsonFailure(correlationId, 400, {
      error: content.error,
      classification: "validation",
      retryable: false,
      recoveryGuidance: "Fix the message, image, or link and try again.",
    });
  }

  const message = args.request.message.trim();
  const admin = getSupabaseAdmin();
  if (!admin) {
    await logPublishEvent({
      level: "error",
      provider: ledgerProvider,
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
  const payloadFp = fingerprintPublishPayload({
    message,
    link: args.request.link,
    promotionId: args.request.promotionId,
  });

  const claim = await claimPublish(
    admin,
    {
      provider: ledgerProvider,
      targetRef,
      promotionId: args.request.promotionId ?? null,
      message,
      link: args.request.link ?? null,
      explicitKey: args.explicitIdempotencyKey,
    },
    args.publishedBy,
  );

  if (claim.outcome === "duplicate_succeeded") {
    await logPublishEvent({
      provider: ledgerProvider,
      phase: "idempotent_replay",
      correlationId,
      outcome: "duplicate_succeeded",
      providerResponseId: claim.externalPostId,
      latencyMs: Date.now() - startedAt,
    });
    const result: Extract<PublishResult, { ok: true }> = {
      ok: true,
      externalPostId: claim.externalPostId ?? "",
      postId: claim.externalPostId ?? undefined,
      postName: claim.externalPostId ?? undefined,
    };
    return {
      ok: true,
      state: "idempotent_replay",
      correlationId,
      idempotentReplay: true,
      result,
    };
  }

  if (claim.outcome === "in_progress") {
    await logPublishEvent({
      level: "warn",
      provider: ledgerProvider,
      phase: "rejected",
      correlationId,
      outcome: "in_progress",
    });
    return jsonFailure(correlationId, 409, {
      error: "A publish for this content is already in progress.",
      classification: "conflict",
      retryable: true,
      retryAfterMs: 15_000,
      recoveryGuidance:
        "Wait for the in-progress publish to finish. If it stays stuck longer than 10 minutes, retry — the ledger will reclaim abandoned claims.",
    });
  }

  if (claim.outcome === "conflict") {
    await logPublishEvent({
      level: "warn",
      provider: ledgerProvider,
      phase: "rejected",
      correlationId,
      outcome: "conflict",
    });
    return jsonFailure(correlationId, 409, {
      error: "This idempotency key was already used with different content.",
      classification: "conflict",
      retryable: false,
      recoveryGuidance:
        "Use a new Idempotency-Key header for a deliberate repost, or change the message/link.",
    });
  }

  let claimId: string;
  let attempts: number;
  if (claim.outcome === "claimed" || claim.outcome === "retry") {
    claimId = claim.id;
    attempts = claim.attempts;
    await logPublishEvent({
      provider: ledgerProvider,
      phase: "claim",
      correlationId,
      publishId: claimId,
      idempotencyKeyFingerprint: payloadFp,
      outcome: claim.outcome,
      attempts,
    });
  } else {
    await logPublishEvent({
      level: "error",
      provider: ledgerProvider,
      phase: "rejected",
      correlationId,
      outcome: "claim_error",
      detail: claim.error,
    });
    return jsonFailure(correlationId, 503, {
      error: "Could not claim publish idempotency. Retry shortly.",
      classification: "provider_unavailable",
      retryable: true,
    });
  }

  const providerStarted = Date.now();
  await logPublishEvent({
    provider: ledgerProvider,
    phase: "provider_call",
    correlationId,
    publishId: claimId,
    attempts,
  });

  const result = await provider.publish({ ...args.request, message });

  if (!result.ok) {
    const failure = provider.classifyError({
      httpStatus: result.status,
      rawMessage: result.error,
    });
    await markPublishFailed(admin, claimId, result.error);
    await recordPublishHistory({
      provider: ledgerProvider,
      status: "failed",
      error: result.error,
      apiResponse: result.providerResponse,
      promotionId: args.request.promotionId,
      campaignName: args.request.campaignName,
      publishedBy: args.publishedBy,
    });
    await logPublishEvent({
      level: "error",
      provider: ledgerProvider,
      phase: "provider_result",
      correlationId,
      publishId: claimId,
      outcome: "failed",
      classification: failure.classification,
      retryable: failure.retryable,
      httpStatus: failure.httpStatus,
      latencyMs: Date.now() - providerStarted,
      attempts,
      detail: failure.userMessage,
    });
    await logPublishEvent({
      level: "warn",
      provider: ledgerProvider,
      phase: "ledger_failed",
      correlationId,
      publishId: claimId,
      attempts,
    });
    return jsonFailure(
      correlationId,
      failure.httpStatus,
      publishFailureResponseBody(failure) as unknown as Record<string, unknown>,
      "failed",
    );
  }

  await markPublishSucceeded(admin, claimId, result.externalPostId ?? null);
  await recordPublishHistory({
    provider: ledgerProvider,
    status: "published",
    responseId: result.externalPostId,
    apiResponse: result.providerResponse,
    promotionId: args.request.promotionId,
    campaignName: args.request.campaignName,
    publishedBy: args.publishedBy,
  });
  await logPublishEvent({
    provider: ledgerProvider,
    phase: "provider_result",
    correlationId,
    publishId: claimId,
    outcome: "succeeded",
    providerResponseId: result.externalPostId,
    latencyMs: Date.now() - providerStarted,
    attempts,
  });
  await logPublishEvent({
    provider: ledgerProvider,
    phase: "ledger_success",
    correlationId,
    publishId: claimId,
    providerResponseId: result.externalPostId,
    latencyMs: Date.now() - startedAt,
    attempts,
  });

  if (provider.afterPublishSuccess) {
    await provider.afterPublishSuccess({
      request: args.request,
      result,
      publishedBy: args.publishedBy,
      correlationId,
    });
  }

  return {
    ok: true,
    state: "succeeded",
    correlationId,
    attempts,
    result,
  };
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
