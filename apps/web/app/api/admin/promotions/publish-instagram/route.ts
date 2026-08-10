import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  connectInstagramForAdmin,
  getProviderRegistry,
  publishOutcomeToHttp,
  runPublish,
} from "@/lib/promotions/providers";
import { disconnectInstagramConnection } from "@/lib/promotions/instagramPublish";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET — Instagram connection / publish readiness (Facebook Login path).
 * Does not expose tokens or raw Graph payloads. Connection diagnostics are
 * available even while the publish feature flag is off.
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const provider = getProviderRegistry().get("instagram");
  const status = await provider.validateConnection();
  const details = status.details ?? {};

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    okForPublish:
      Boolean(details.okForPublish ?? status.connected) &&
      getProviderRegistry()
        .listEntries()
        .some((entry) => entry.provider.key === "instagram" && entry.enabled),
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
 *
 * Connect/disconnect are intentionally allowed with the publish flag off.
 * Actual publishing still flows through runPublish/requireEnabled and remains
 * fail-closed.
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

  if (body.action === "connect") {
    const result = await connectInstagramForAdmin(auth.email);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error, status: result.status ?? null },
        { status: 400 },
      );
    }
    if (result.authorizationUrl) {
      return NextResponse.json({
        ok: true,
        authorizationUrl: result.authorizationUrl,
        connected: false,
        displayName: result.status?.displayName ?? null,
        targetRef: result.status?.targetRef ?? null,
      });
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
