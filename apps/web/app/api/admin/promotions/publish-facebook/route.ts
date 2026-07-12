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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const status = result.status && result.status >= 400 && result.status < 600 ? result.status : 400;
    return NextResponse.json({ error: result.error }, { status });
  }

  if (body.promotionId) {
    const admin = getSupabaseAdmin();
    if (admin) {
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
  }

  return NextResponse.json({
    ok: true,
    postId: result.postId,
    photoId: result.photoId ?? null,
  });
}
