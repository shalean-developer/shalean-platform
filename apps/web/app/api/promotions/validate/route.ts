import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import {
  evaluateCheckoutPromotions,
  getCompletedBookingCount,
  getActiveMembershipDiscountPercent,
} from "@/lib/promotions/server";
import { resolveCheckoutPromoEligibilityExtras } from "@/lib/promotions/resolveCheckoutPromoEligibilityExtras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validate / preview promotions for checkout (auth optional for guests). */
export async function POST(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  let body: {
    promoCode?: string;
    serviceSlug?: string;
    selectedExtraIds?: string[];
    subtotalZar?: number;
    cityId?: string;
    locationId?: string;
    suburb?: string;
    suburbId?: string;
    customerEmail?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid body." }, { status: 400 });
  }

  const subtotalZar = Math.round(Number(body.subtotalZar ?? 0));
  if (!body.serviceSlug || subtotalZar <= 0) {
    return NextResponse.json({ error: "serviceSlug and subtotalZar required." }, { status: 400 });
  }

  const auth = await resolveBookingRouteBearerAuth(request);
  const userId = auth.kind === "authenticated" ? auth.userId : null;
  const email =
    body.customerEmail?.trim() ||
    (auth.kind === "authenticated" ? auth.email ?? "" : "") ||
    "";

  if (auth.kind === "invalid_token") {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }

  const [completedBookingCount, membershipDiscountPercent] = await Promise.all([
    getCompletedBookingCount(admin, userId, email),
    getActiveMembershipDiscountPercent(admin, userId),
  ]);

  const locationId = body.locationId?.trim() || body.suburbId?.trim() || null;
  const promoExtras = await resolveCheckoutPromoEligibilityExtras(admin, {
    userId,
    locationId,
    completedBookingCount,
  });

  try {
    const result = await evaluateCheckoutPromotions(admin, {
      userId,
      customerEmail: email,
      completedBookingCount,
      serviceSlug: body.serviceSlug,
      selectedExtraIds: body.selectedExtraIds ?? [],
      cityId: body.cityId,
      locationId: body.locationId,
      suburb: body.suburb,
      suburbId: promoExtras.suburbId ?? body.suburbId ?? null,
      customerSegments: promoExtras.customerSegments,
      subtotalZar,
      promoCode: body.promoCode,
      membershipDiscountPercent,
    });

    return NextResponse.json({
      applied: result.applied,
      totalDiscountZar: result.totalDiscountZar,
      rejected: result.rejected,
      eligible: result.eligible,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Evaluation failed." },
      { status: 500 },
    );
  }
}
