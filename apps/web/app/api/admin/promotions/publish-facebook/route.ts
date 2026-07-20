import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  getProviderRegistry,
  publishOutcomeToHttp,
  runPublish,
} from "@/lib/promotions/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — whether Facebook Page publishing is configured + token kind diagnostics. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const provider = getProviderRegistry().requireEnabled("facebook");
  const status = await provider.validateConnection();
  const details = status.details ?? {};

  return NextResponse.json({
    configured: status.configured,
    pageId: details.pageIdMasked ?? null,
    tokenKind: details.tokenKind ?? null,
    tokenSubjectName: status.displayName,
    okForPublish: Boolean(details.okForPublish ?? status.connected),
    hint: status.hint,
  });
}

/**
 * POST — publish campaign copy to the Facebook Page.
 * Body: { message, imageDataUrl?, link?, promotionId? }
 *
 * Orchestration (idempotency, observability, history) lives in runPublish (MKT-001C).
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

  const outcome = await runPublish({
    providerKey: "facebook",
    publishedBy: auth.email,
    explicitIdempotencyKey: request.headers.get("idempotency-key"),
    request: {
      message: body.message?.trim() ?? "",
      imageDataUrl: body.imageDataUrl,
      imageUrl: body.imageUrl,
      link: body.link,
      promotionId: body.promotionId,
    },
  });

  const http = publishOutcomeToHttp(outcome);
  // Preserve prior Facebook success shape (omit GBP-only fields when unused).
  if (outcome.ok && !outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        postId: outcome.result.postId ?? outcome.result.externalPostId,
        photoId: outcome.result.photoId ?? null,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  if (outcome.ok && outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        postId: outcome.result.postId ?? outcome.result.externalPostId,
        idempotentReplay: true,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  return NextResponse.json(http.body, { status: http.status });
}
