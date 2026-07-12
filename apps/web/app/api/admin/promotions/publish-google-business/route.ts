import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { recordPromotionEvent } from "@/lib/promotions/server";
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

  const media = await ensurePublicImageUrlForGooglePost({
    imageUrl: body.imageUrl,
    imageDataUrl: body.imageDataUrl,
    promotionId: body.promotionId,
  });
  if (!media.ok) {
    await recordPublishHistory({
      status: "failed",
      error: media.error,
      promotionId: body.promotionId,
      campaignName: body.campaignName,
      publishedBy: auth.email,
    });
    return NextResponse.json({ error: media.error }, { status: 400 });
  }

  const result = await createGoogleBusinessLocalPost({
    summary: message,
    imageUrl: media.imageUrl,
    callToActionUrl: body.link,
  });

  if (!result.ok) {
    await recordPublishHistory({
      status: "failed",
      error: result.error,
      apiResponse: result.apiResponse,
      promotionId: body.promotionId,
      campaignName: body.campaignName,
      publishedBy: auth.email,
    });
    const status = result.status && result.status >= 400 && result.status < 600 ? result.status : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  await recordPublishHistory({
    status: "published",
    responseId: result.postName,
    apiResponse: result.apiResponse,
    promotionId: body.promotionId,
    campaignName: body.campaignName,
    publishedBy: auth.email,
  });

  if (body.promotionId) {
    const admin = getSupabaseAdmin();
    if (admin) {
      try {
        await recordPromotionEvent(admin, {
          promotionId: body.promotionId,
          eventType: "click",
          metadata: {
            channel: "google_business",
            action: "published",
            postId: result.postName,
            actor: auth.email,
          },
        });
        await admin.from("promotion_audit_log").insert({
          promotion_id: body.promotionId,
          action: "publish_google_business",
          actor: auth.email,
          after_state: {
            postName: result.postName,
            searchUrl: result.searchUrl ?? null,
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
  }

  return NextResponse.json({
    ok: true,
    postName: result.postName,
    searchUrl: result.searchUrl ?? null,
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
