import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/requireAdminApi";
import {
  getProviderRegistry,
  publishOutcomeToHttp,
  runPublish,
} from "@/lib/promotions/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET — whether Google Business publishing is ready. */
export async function GET(request: Request) {
  const auth = await requireAdminApi(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const provider = getProviderRegistry().requireEnabled("google_business");
  const status = await provider.validateConnection();
  const details = status.details ?? {};

  return NextResponse.json({
    configured: status.configured,
    connected: status.connected,
    oauthConfigured: Boolean(details.oauthConfigured),
    accountName: (details.accountName as string | null) ?? null,
    locationName: (details.locationName as string | null) ?? null,
    status: status.statusLabel,
    health: status.health,
    hint: status.hint,
  });
}

/**
 * POST — publish campaign copy + image to Google Business Profile local posts.
 * Body: { message, imageDataUrl?, imageUrl?, link?, promotionId?, campaignName? }
 *
 * Orchestration (idempotency, observability, history) lives in runPublish (MKT-001C).
 * Media upload remains inside the GBP provider and still runs after claim.
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

  const outcome = await runPublish({
    providerKey: "google_business",
    publishedBy: auth.email,
    explicitIdempotencyKey: request.headers.get("idempotency-key"),
    request: {
      message: body.message?.trim() ?? "",
      imageDataUrl: body.imageDataUrl,
      imageUrl: body.imageUrl,
      link: body.link,
      promotionId: body.promotionId,
      campaignName: body.campaignName,
    },
  });

  const http = publishOutcomeToHttp(outcome);
  if (outcome.ok && !outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        postName: outcome.result.postName ?? outcome.result.externalPostId,
        searchUrl: outcome.result.searchUrl ?? null,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  if (outcome.ok && outcome.idempotentReplay) {
    return NextResponse.json(
      {
        ok: true,
        postName: outcome.result.postName ?? outcome.result.externalPostId,
        idempotentReplay: true,
        correlationId: outcome.correlationId,
      },
      { status: 200 },
    );
  }
  return NextResponse.json(http.body, { status: http.status });
}
