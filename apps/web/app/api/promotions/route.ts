import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  checkPromotionTelemetryRateLimit,
  promotionTelemetryRateLimitResponse,
} from "@/lib/rateLimit/promotionTelemetryRateLimit";
import {
  getActiveDisplayPromotions,
  recordPromotionEvent,
  type PromotionDisplaySurface,
} from "@/lib/promotions/server";
import { campaignLandingPath } from "@/lib/promotions/offerCopy";
import { formatOfferLabel } from "@/lib/promotions/offerCopy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SESSION_ID_LENGTH = 128;

const SURFACES = new Set<PromotionDisplaySurface>([
  "homepage",
  "booking",
  "pricing",
  "announcement",
  "popup",
  "featured",
  "dashboard",
  "booking_banner",
]);

function mapPublic(p: Awaited<ReturnType<typeof getActiveDisplayPromotions>>[number]) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    type: p.promotion_type,
    bannerImageUrl: p.banner_image_url,
    heroImageUrl: p.hero_image_url ?? p.banner_image_url,
    landingPagePath: campaignLandingPath(p),
    headline: p.display_config.headline ?? p.name,
    subheadline: p.display_config.subheadline ?? p.description,
    cta: p.cta_label ?? p.display_config.cta ?? "Book now",
    colours: p.display_config.colours,
    countdown: Boolean(p.display_config.countdown ?? true),
    endsAt: p.ends_at,
    startsAt: p.starts_at,
    promoCode: p.promo_code,
    discountType: p.discount_type,
    discountValue: p.discount_value,
    offerLabel: formatOfferLabel({
      discountType: p.discount_type,
      discountValue: p.discount_value,
    }),
    qrCodeDataUrl: p.qr_code_data_url ?? null,
    termsHtml: p.terms_html ?? null,
  };
}

/** Public: active promotions for website surfaces. */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ promotions: [] });

  const url = new URL(request.url);
  const surfaceParam = (url.searchParams.get("surface") ?? "homepage") as PromotionDisplaySurface;
  const surface = SURFACES.has(surfaceParam) ? surfaceParam : "homepage";

  try {
    const promotions = await getActiveDisplayPromotions(admin, surface);
    return NextResponse.json({ promotions: promotions.map(mapPublic) });
  } catch {
    return NextResponse.json({ promotions: [] });
  }
}

/** Track view/click/landing/qr/popup events (public, best-effort). */
export async function POST(request: Request) {
  const limit = checkPromotionTelemetryRateLimit(request);
  if (!limit.allowed) return promotionTelemetryRateLimitResponse(limit);

  let body: {
    promotionId?: string;
    eventType?:
      | "view"
      | "click"
      | "landing_visit"
      | "qr_scan"
      | "popup_view"
      | "popup_dismiss"
      | "booking_started";
    sessionId?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const allowed = new Set([
    "view",
    "click",
    "landing_visit",
    "qr_scan",
    "popup_view",
    "popup_dismiss",
    "booking_started",
  ]);
  if (
    !body.promotionId ||
    !UUID_PATTERN.test(body.promotionId) ||
    !body.eventType ||
    !allowed.has(body.eventType)
  ) {
    return NextResponse.json({ error: "Valid promotionId and eventType required." }, { status: 400 });
  }

  const sessionId =
    body.sessionId == null
      ? null
      : typeof body.sessionId === "string" &&
          body.sessionId.length > 0 &&
          body.sessionId.length <= MAX_SESSION_ID_LENGTH
        ? body.sessionId
        : undefined;
  if (body.sessionId != null && sessionId === undefined) {
    return NextResponse.json({ error: "Invalid sessionId." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true });

  try {
    await recordPromotionEvent(admin, {
      promotionId: body.promotionId,
      eventType: body.eventType,
      sessionId,
    });
  } catch {
    // best-effort
  }
  return NextResponse.json({ ok: true });
}
