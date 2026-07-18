import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  ProviderDisabledError,
  getProviderRegistry,
  publishOutcomeToHttp,
  runPublish,
} from "@/lib/promotions/providers";
import { disconnectXConnection } from "@/lib/promotions/xPublish";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function disabledResponse(e: ProviderDisabledError) {
  return NextResponse.json(
    {
      configured: false,
      connected: false,
      okForPublish: false,
      error: e.message,
      hint: "X is disabled by feature flag (MARKETING_PROVIDER_X).",
      statusLabel: "disabled",
      authModel: "oauth2_pkce",
    },
    { status: 403 },
  );
}

/**
 * GET — X connection / publish readiness (no secrets).
 */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let provider;
  try {
    provider = getProviderRegistry().requireEnabled("x");
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
    authModel: details.authModel ?? "oauth2_pkce",
    userId: details.userIdMasked ?? null,
    username: details.username ?? null,
  });
}

/**
 * POST — text tweet publish, or connect/disconnect.
 * Body publish: { message, promotionId? }
 * Body connect: { action: "connect" } → returns authorizationUrl
 * Body disconnect: { action: "disconnect" }
 */
export async function POST(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: {
    action?: string;
    message?: string;
    promotionId?: string | null;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  let provider;
  try {
    provider = getProviderRegistry().requireEnabled("x");
  } catch (e) {
    if (e instanceof ProviderDisabledError) return disabledResponse(e);
    throw e;
  }

  if (body.action === "connect") {
    const result = await provider.connect();
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      ok: true,
      authorizationUrl: result.authorizationUrl ?? "/api/oauth/x",
      status: result.status,
    });
  }

  if (body.action === "disconnect") {
    const result = await disconnectXConnection({ actor: auth.email ?? "admin" });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  const message = body.message?.trim() ?? "";
  if (!message) {
    return NextResponse.json({ error: "message is required." }, { status: 400 });
  }

  const outcome = await runPublish({
    providerKey: "x",
    publishedBy: auth.email,
    explicitIdempotencyKey: request.headers.get("idempotency-key"),
    request: {
      message,
      promotionId: body.promotionId ?? null,
    },
  });

  const http = publishOutcomeToHttp(outcome);

  const admin = getSupabaseAdmin();
  if (admin) {
    await admin.from("social_publish_history").insert({
      provider: "twitter",
      campaign_name: null,
      status: outcome.ok ? "published" : "failed",
      response_id: outcome.ok ? outcome.result.externalPostId : null,
      error_message: outcome.ok
        ? null
        : typeof http.body.error === "string"
          ? http.body.error
          : "X publish failed.",
      published_by: auth.email ?? "admin",
    });
  }

  if (outcome.ok && !outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        tweetId: outcome.result.externalPostId,
        postId: outcome.result.postId ?? outcome.result.externalPostId,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  if (outcome.ok && outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        tweetId: outcome.result.externalPostId,
        postId: outcome.result.postId ?? outcome.result.externalPostId,
        idempotentReplay: true,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  return NextResponse.json(http.body, { status: http.status });
}
