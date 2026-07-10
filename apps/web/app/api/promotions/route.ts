import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getActiveDisplayPromotions,
  recordPromotionEvent,
  type PromotionDisplaySurface,
} from "@/lib/promotions/server";
import { campaignLandingPath } from "@/lib/promotions/offerCopy";
import { formatOfferLabel } from "@/lib/promotions/offerCopy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true });

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
  if (!body.promotionId || !body.eventType || !allowed.has(body.eventType)) {
    return NextResponse.json({ error: "promotionId and eventType required." }, { status: 400 });
  }

  try {
    await recordPromotionEvent(admin, {
      promotionId: body.promotionId,
      eventType: body.eventType,
      sessionId: body.sessionId ?? null,
    });
  } catch {
    // best-effort
  }
  return NextResponse.json({ ok: true });
}
