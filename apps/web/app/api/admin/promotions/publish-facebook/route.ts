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
import { logSystemEvent } from "@/lib/logging/systemLog";

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
  const admin = getSupabaseAdmin();
  const cfg = getFacebookPagePublishConfig();
  const explicitKey = request.headers.get("idempotency-key");
  let claimId: string | null = null;

  if (admin) {
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
      return NextResponse.json({ ok: true, postId: claim.externalPostId, idempotentReplay: true });
    }
    if (claim.outcome === "in_progress") {
      return NextResponse.json(
        { error: "A publish for this content is already in progress." },
        { status: 409 },
      );
    }
    if (claim.outcome === "conflict") {
      return NextResponse.json(
        { error: "This idempotency key was already used with different content." },
        { status: 409 },
      );
    }
    if (claim.outcome === "claimed" || claim.outcome === "retry") {
      claimId = claim.id;
    } else {
      // Ledger error: log and proceed (do not block the business action).
      await logSystemEvent({
        level: "warn",
        source: "publish_facebook",
        message: "idempotency_claim_error",
        context: { detail: claim.error },
      });
    }
  }

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
    if (admin && claimId) await markPublishFailed(admin, claimId, result.error);
    await recordFacebookPublishHistory({
      status: "failed",
      error: result.error,
      promotionId: body.promotionId,
      publishedBy: auth.email,
    });
    const status = result.status && result.status >= 400 && result.status < 600 ? result.status : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  if (admin && claimId) await markPublishSucceeded(admin, claimId, result.postId ?? null);
  await recordFacebookPublishHistory({
    status: "published",
    responseId: result.postId,
    promotionId: body.promotionId,
    publishedBy: auth.email,
  });

  if (body.promotionId && admin) {
    try {
      await recordPromotionEvent(admin, {
        promotionId: body.promotionId,
        eventType: "click",
        metadata: {
          channel: "facebook",
          action: "published",
          postId: result.postId,
          actor: auth.email,
        },
      });
      await admin.from("promotion_audit_log").insert({
        promotion_id: body.promotionId,
        action: "publish_facebook",
        actor: auth.email,
        after_state: { postId: result.postId, photoId: result.photoId ?? null },
      });
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({
    ok: true,
    postId: result.postId,
    photoId: result.photoId ?? null,
  });
}
