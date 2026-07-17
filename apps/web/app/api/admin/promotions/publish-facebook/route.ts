import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  diagnoseFacebookPagePublishConfig,
  getFacebookPagePublishConfig,
  publishFacebookPageFeed,
  publishFacebookPagePhoto,
  publishFacebookPagePhotoFromUrl,
} from "@/lib/promotions/facebookPublish";
import { recordPromotionEvent } from "@/lib/promotions/server";
import {
  claimPublish,
  markPublishFailed,
  markPublishSucceeded,
} from "@/lib/promotions/publishIdempotency";
import {
  classifyPublishFailure,
  publishFailureResponseBody,
} from "@/lib/promotions/publishProviderErrors";
import {
  createPublishCorrelationId,
  fingerprintPublishPayload,
  logPublishEvent,
} from "@/lib/promotions/publishObservability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function recordFacebookPublishHistory(args: {
  status: "published" | "failed";
  responseId?: string | null;
  error?: string | null;
  promotionId?: string | null;
  campaignName?: string | null;
  publishedBy: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from("social_publish_history").insert({
      provider: "facebook",
      promotion_id: args.promotionId ?? null,
      campaign_name: args.campaignName ?? null,
      status: args.status,
      response_id: args.responseId ?? null,
      api_response: {},
      error_message: args.error ?? null,
      published_by: args.publishedBy,
    });
  } catch {
    // best-effort audit trail
  }
}

/** GET — whether Facebook Page publishing is configured + token kind diagnostics. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const diagnosis = await diagnoseFacebookPagePublishConfig();
  const cfg = getFacebookPagePublishConfig();
  return NextResponse.json({
    configured: diagnosis.configured,
    pageId: cfg ? `${cfg.pageId.slice(0, 4)}…` : null,
    tokenKind: diagnosis.tokenKind,
    tokenSubjectName: diagnosis.tokenSubjectName,
    okForPublish: diagnosis.okForPublish,
    hint: diagnosis.hint,
  });
}

/**
 * POST — publish campaign copy to the Facebook Page.
 * Body: { message, imageDataUrl?, link?, promotionId? }
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const correlationId = createPublishCorrelationId();
  const startedAt = Date.now();

  let body: {
    message?: string;
    imageDataUrl?: string | null;
    imageUrl?: string | null;
    link?: string | null;
    promotionId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const message = body.message?.trim() ?? "";
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  // Server-side idempotency: block double-clicks / retries / concurrent races
  // from creating duplicate Facebook posts (MKT-001A / WS4).
  // MKT-001B: fail closed when the ledger is unavailable (no silent duplicate path).
  const admin = getSupabaseAdmin();
  if (!admin) {
    await logPublishEvent({
      level: "error",
      provider: "facebook",
      phase: "rejected",
      correlationId,
      outcome: "admin_unavailable",
      detail: "Supabase admin client unavailable; refusing publish.",
    });
    return NextResponse.json(
      {
        error: "Publishing temporarily unavailable (idempotency ledger offline). Retry shortly.",
        classification: "provider_unavailable",
        retryable: true,
        correlationId,
      },
      { status: 503 },
    );
  }

  const cfg = getFacebookPagePublishConfig();
  const explicitKey = request.headers.get("idempotency-key");
  let claimId: string | null = null;
  let attempts = 1;
  const payloadFp = fingerprintPublishPayload({
    message,
    link: body.link,
    promotionId: body.promotionId,
  });

  const claim = await claimPublish(
    admin,
    {
      provider: "facebook",
      targetRef: cfg?.pageId ?? null,
      promotionId: body.promotionId ?? null,
      message,
      link: body.link ?? null,
      explicitKey,
    },
    auth.email,
  );

  if (claim.outcome === "duplicate_succeeded") {
    await logPublishEvent({
      provider: "facebook",
      phase: "idempotent_replay",
      correlationId,
      outcome: "duplicate_succeeded",
      providerResponseId: claim.externalPostId,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      ok: true,
      postId: claim.externalPostId,
      idempotentReplay: true,
      correlationId,
    });
  }
  if (claim.outcome === "in_progress") {
    await logPublishEvent({
      level: "warn",
      provider: "facebook",
      phase: "rejected",
      correlationId,
      outcome: "in_progress",
    });
    return NextResponse.json(
      {
        error: "A publish for this content is already in progress.",
        classification: "conflict",
        retryable: true,
        retryAfterMs: 15_000,
        recoveryGuidance:
          "Wait for the in-progress publish to finish. If it stays stuck longer than 10 minutes, retry — the ledger will reclaim abandoned claims.",
        correlationId,
      },
      { status: 409 },
    );
  }
  if (claim.outcome === "conflict") {
    await logPublishEvent({
      level: "warn",
      provider: "facebook",
      phase: "rejected",
      correlationId,
      outcome: "conflict",
    });
    return NextResponse.json(
      {
        error: "This idempotency key was already used with different content.",
        classification: "conflict",
        retryable: false,
        recoveryGuidance:
          "Use a new Idempotency-Key header for a deliberate repost, or change the message/link.",
        correlationId,
      },
      { status: 409 },
    );
  }
  if (claim.outcome === "claimed" || claim.outcome === "retry") {
    claimId = claim.id;
    attempts = claim.attempts;
    await logPublishEvent({
      provider: "facebook",
      phase: "claim",
      correlationId,
      publishId: claimId,
      idempotencyKeyFingerprint: payloadFp,
      outcome: claim.outcome,
      attempts,
    });
  } else {
    // Ledger error: fail closed (MKT-001B) — do not publish without a claim.
    await logPublishEvent({
      level: "error",
      provider: "facebook",
      phase: "rejected",
      correlationId,
      outcome: "claim_error",
      detail: claim.error,
    });
    return NextResponse.json(
      {
        error: "Could not claim publish idempotency. Retry shortly.",
        classification: "provider_unavailable",
        retryable: true,
        correlationId,
      },
      { status: 503 },
    );
  }

  const providerStarted = Date.now();
  await logPublishEvent({
    provider: "facebook",
    phase: "provider_call",
    correlationId,
    publishId: claimId,
    attempts,
  });

  const result = body.imageDataUrl?.startsWith("data:image/")
    ? await publishFacebookPagePhoto({
        message,
        imageDataUrl: body.imageDataUrl,
        link: body.link,
      })
    : body.imageUrl?.trim()
      ? await publishFacebookPagePhotoFromUrl({
          message,
          imageUrl: body.imageUrl.trim(),
          link: body.link,
        })
      : await publishFacebookPageFeed({ message, link: body.link });

  if (!result.ok) {
    const failure = classifyPublishFailure({
      provider: "facebook",
      httpStatus: result.status,
      rawMessage: result.error,
    });
    await markPublishFailed(admin, claimId, result.error);
    await recordFacebookPublishHistory({
      status: "failed",
      error: result.error,
      promotionId: body.promotionId,
      publishedBy: auth.email,
    });
    await logPublishEvent({
      level: "error",
      provider: "facebook",
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
      provider: "facebook",
      phase: "ledger_failed",
      correlationId,
      publishId: claimId,
      attempts,
    });
    return NextResponse.json(
      { ...publishFailureResponseBody(failure), correlationId },
      { status: failure.httpStatus },
    );
  }

  await markPublishSucceeded(admin, claimId, result.postId ?? null);
  await recordFacebookPublishHistory({
    status: "published",
    responseId: result.postId,
    promotionId: body.promotionId,
    publishedBy: auth.email,
  });
  await logPublishEvent({
    provider: "facebook",
    phase: "provider_result",
    correlationId,
    publishId: claimId,
    outcome: "succeeded",
    providerResponseId: result.postId,
    latencyMs: Date.now() - providerStarted,
    attempts,
  });
  await logPublishEvent({
    provider: "facebook",
    phase: "ledger_success",
    correlationId,
    publishId: claimId,
    providerResponseId: result.postId,
    latencyMs: Date.now() - startedAt,
    attempts,
  });

  if (body.promotionId) {
    try {
      await recordPromotionEvent(admin, {
        promotionId: body.promotionId,
        eventType: "click",
        metadata: {
          channel: "facebook",
          action: "published",
          postId: result.postId,
          actor: auth.email,
          correlationId,
        },
      });
      await admin.from("promotion_audit_log").insert({
        promotion_id: body.promotionId,
        action: "publish_facebook",
        actor: auth.email,
        after_state: {
          postId: result.postId,
          photoId: result.photoId ?? null,
          correlationId,
        },
      });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({
    ok: true,
    postId: result.postId,
    photoId: result.photoId ?? null,
    correlationId,
  });
}
