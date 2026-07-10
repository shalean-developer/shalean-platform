import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getActiveDisplayPromotions, recordPromotionEvent } from "@/lib/promotions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public: active promotions for website surfaces. */
export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ promotions: [] });

  const url = new URL(request.url);
  const surface = (url.searchParams.get("surface") ?? "homepage") as
    | "homepage"
    | "booking"
    | "pricing"
    | "announcement";

  try {
    const promotions = await getActiveDisplayPromotions(admin, surface);
    return NextResponse.json({
      promotions: promotions.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        description: p.description,
        type: p.promotion_type,
        bannerImageUrl: p.banner_image_url,
        landingPagePath: p.landing_page_path ?? p.display_config.landing ?? "/book",
        headline: p.display_config.headline ?? p.name,
        subheadline: p.display_config.subheadline ?? p.description,
        cta: p.display_config.cta ?? "Book now",
        colours: p.display_config.colours,
        countdown: Boolean(p.display_config.countdown),
        endsAt: p.ends_at,
        promoCode: p.promo_code,
        discountType: p.discount_type,
        discountValue: p.discount_value,
      })),
    });
  } catch {
    return NextResponse.json({ promotions: [] });
  }
}

/** Track view/click events (public, best-effort). */
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true });

  let body: { promotionId?: string; eventType?: "view" | "click"; sessionId?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  if (!body.promotionId || (body.eventType !== "view" && body.eventType !== "click")) {
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
