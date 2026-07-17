import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  ProviderDisabledError,
  connectInstagramForAdmin,
  getProviderRegistry,
  publishOutcomeToHttp,
  runPublish,
} from "@/lib/promotions/providers";
import { disconnectInstagramConnection } from "@/lib/promotions/instagramPublish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse(e: ProviderDisabledError) {
  return NextResponse.json(
    {
      configured: false,
      connected: false,
      okForPublish: false,
      error: e.message,
      hint: "Instagram is disabled by feature flag (intentionally off until staging verification).",
      statusLabel: "disabled",
      authModel: "facebook_login",
    },
    { status: 403 },
  );
}

/**
 * GET — Instagram connection / publish readiness (Facebook Login path).
 * Does not expose tokens or raw Graph payloads.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let provider;
  try {
    provider = getProviderRegistry().requireEnabled("instagram");
  } catch (e) {
    if (e instanceof ProviderDisabledError) return disabledResponse(e);
    throw e;
  }
  const status = await provider.validateConnection();
  const details = status.details ?? {};

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    okForPublish: Boolean(details.okForPublish ?? status.connected),
    displayName: status.displayName,
    hint: status.hint,
    statusLabel: status.statusLabel,
    authModel: details.authModel ?? "facebook_login",
    igUserId: details.igUserIdMasked ?? null,
    pageId: details.pageIdMasked ?? null,
  });
}

/**
 * POST — publish single-image Instagram feed post, or connect/disconnect.
 * Body publish: { message, imageUrl, link?, promotionId? }
 * Body connect: { action: "connect" }
 * Body disconnect: { action: "disconnect" }
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
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

  if (body.action === "connect" || body.action === "disconnect") {
    try {
      getProviderRegistry().requireEnabled("instagram");
    } catch (e) {
      if (e instanceof ProviderDisabledError) return disabledResponse(e);
      throw e;
    }
  }

  if (body.action === "connect") {
    const result = await connectInstagramForAdmin(auth.email);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, status: result.status ?? null },
        { status: 400 },
      );
    }
    return NextResponse.json({
      ok: true,
      connected: true,
      displayName: result.status.displayName,
      targetRef: result.status.targetRef,
    });
  }

  if (body.action === "disconnect") {
    const result = await disconnectInstagramConnection();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, connected: false });
  }

  const outcome = await runPublish({
    providerKey: "instagram",
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
  if (outcome.ok && !outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        mediaId: outcome.result.externalPostId,
        postId: outcome.result.postId ?? outcome.result.externalPostId,
        permalink: outcome.result.searchUrl ?? null,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  if (outcome.ok && outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        mediaId: outcome.result.externalPostId,
        postId: outcome.result.postId ?? outcome.result.externalPostId,
        idempotentReplay: true,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  return NextResponse.json(http.body, { status: http.status });
}
