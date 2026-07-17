import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
import {
  createGoogleBusinessLocalPost,
  ensurePublicImageUrlForGooglePost,
  getGoogleBusinessConnectionPublic,
} from "@/lib/google-business";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — whether Google Business publishing is ready. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const gbp = await getGoogleBusinessConnectionPublic();
  return NextResponse.json({
    configured: gbp.configured,
    connected: gbp.connected,
    oauthConfigured: gbp.oauthConfigured,
    accountName: gbp.account?.accountName ?? null,
    locationName: gbp.account?.locationName ?? null,
    status: gbp.account?.status ?? "disconnected",
    health: gbp.account?.health ?? "unknown",
    hint:
      !gbp.oauthConfigured
        ? "Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI."
        : !gbp.connected
          ? "Connect Google Business Profile from Connected Accounts."
          : gbp.account?.status !== "connected"
            ? "Select a Business location before publishing."
            : null,
  });
}

/**
 * POST — publish campaign copy + image to Google Business Profile local posts.
 * Body: { message, imageDataUrl?, imageUrl?, link?, promotionId?, campaignName? }
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
    campaignName?: string | null;
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

  // Server-side idempotency (claim BEFORE media upload / provider call) so
  // double-clicks / retries / races cannot create duplicate posts or orphan
  // uploads (MKT-001A / WS4).
  // MKT-001B: fail closed when the ledger is unavailable.
  const admin = getSupabaseAdmin();
  if (!admin) {
    await logPublishEvent({
      level: "error",
      provider: "google_business",
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
      provider: "google_business",
      targetRef: "google_business",
      promotionId: body.promotionId ?? null,
      message,
      link: body.link ?? null,
      explicitKey,
    },
    auth.email,
  );

  if (claim.outcome === "duplicate_succeeded") {
    await logPublishEvent({
      provider: "google_business",
      phase: "idempotent_replay",
      correlationId,
      outcome: "duplicate_succeeded",
      providerResponseId: claim.externalPostId,
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({
      ok: true,
      postName: claim.externalPostId,
      idempotentReplay: true,
      correlationId,
    });
  }
  if (claim.outcome === "in_progress") {
    await logPublishEvent({
      level: "warn",
      provider: "google_business",
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
      provider: "google_business",
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
      provider: "google_business",
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
      provider: "google_business",
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

  const media = await ensurePublicImageUrlForGooglePost({
    imageUrl: body.imageUrl,
    imageDataUrl: body.imageDataUrl,
    promotionId: body.promotionId,
  });
  if (!media.ok) {
    const failure = classifyPublishFailure({
      provider: "google_business",
      httpStatus: 400,
      rawMessage: media.error,
    });
    await markPublishFailed(admin, claimId, media.error);
    await recordPublishHistory({
      status: "failed",
      error: media.error,
      promotionId: body.promotionId,
      campaignName: body.campaignName,
      publishedBy: auth.email,
    });
    await logPublishEvent({
      level: "error",
      provider: "google_business",
      phase: "provider_result",
      correlationId,
      publishId: claimId,
      outcome: "media_failed",
      classification: failure.classification,
      retryable: failure.retryable,
      httpStatus: 400,
      attempts,
      detail: media.error,
    });
    return NextResponse.json(
      { ...publishFailureResponseBody(failure), correlationId },
      { status: 400 },
    );
  }

  const providerStarted = Date.now();
  await logPublishEvent({
    provider: "google_business",
    phase: "provider_call",
    correlationId,
    publishId: claimId,
    attempts,
  });

  const result = await createGoogleBusinessLocalPost({
    summary: message,
    imageUrl: media.imageUrl,
    callToActionUrl: body.link,
  });

  if (!result.ok) {
    const failure = classifyPublishFailure({
      provider: "google_business",
      httpStatus: result.status,
      rawMessage: result.error,
    });
    await markPublishFailed(admin, claimId, result.error);
    await recordPublishHistory({
      status: "failed",
      error: result.error,
      apiResponse: result.apiResponse,
      promotionId: body.promotionId,
      campaignName: body.campaignName,
      publishedBy: auth.email,
    });
    await logPublishEvent({
      level: "error",
      provider: "google_business",
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
    return NextResponse.json(
      { ...publishFailureResponseBody(failure), correlationId },
      { status: failure.httpStatus },
    );
  }

  await markPublishSucceeded(admin, claimId, result.postName ?? null);
  await recordPublishHistory({
    status: "published",
    responseId: result.postName,
    apiResponse: result.apiResponse,
    promotionId: body.promotionId,
    campaignName: body.campaignName,
    publishedBy: auth.email,
  });
  await logPublishEvent({
    provider: "google_business",
    phase: "provider_result",
    correlationId,
    publishId: claimId,
    outcome: "succeeded",
    providerResponseId: result.postName,
    latencyMs: Date.now() - providerStarted,
    attempts,
  });
  await logPublishEvent({
    provider: "google_business",
    phase: "ledger_success",
    correlationId,
    publishId: claimId,
    providerResponseId: result.postName,
    latencyMs: Date.now() - startedAt,
    attempts,
  });

  if (body.promotionId) {
    try {
      await recordPromotionEvent(admin, {
        promotionId: body.promotionId,
        eventType: "click",
        metadata: {
          channel: "google_business",
          action: "published",
          postId: result.postName,
          actor: auth.email,
          correlationId,
        },
      });
      await admin.from("promotion_audit_log").insert({
        promotion_id: body.promotionId,
        action: "publish_google_business",
        actor: auth.email,
        after_state: {
          postName: result.postName,
          searchUrl: result.searchUrl ?? null,
          correlationId,
        },
      });
      await admin
        .from("campaign_content")
        .update({ status: "published", updated_at: new Date().toISOString() })
        .eq("promotion_id", body.promotionId)
        .eq("channel", "google_business");
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({
    ok: true,
    postName: result.postName,
    searchUrl: result.searchUrl ?? null,
    correlationId,
  });
}

async function recordPublishHistory(args: {
  status: "published" | "failed";
  responseId?: string;
  apiResponse?: Record<string, unknown>;
  error?: string;
  promotionId?: string | null;
  campaignName?: string | null;
  publishedBy: string;
}) {
  const admin = getSupabaseAdmin();
  if (!admin) return;
  try {
    await admin.from("social_publish_history").insert({
      provider: "google_business",
      promotion_id: args.promotionId ?? null,
      campaign_name: args.campaignName ?? null,
      status: args.status,
      response_id: args.responseId ?? null,
      api_response: args.apiResponse ?? {},
      error_message: args.error ?? null,
      published_by: args.publishedBy,
    });
  } catch (e) {
    console.warn("[gbp] publish_history_failed", {
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
