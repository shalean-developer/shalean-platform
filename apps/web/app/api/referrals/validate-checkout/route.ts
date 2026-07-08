import { NextResponse } from "next/server";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateReferralForCheckout } from "@/lib/referrals/validateReferral";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validates a stored referral code for checkout and returns the discount amount. */
export async function POST(request: Request) {
  let body: { code?: string; email?: string };
  try {
    body = (await request.json()) as { code?: string; email?: string };
  } catch {
    return NextResponse.json({ valid: false, error: "Invalid request body." }, { status: 400 });
  }

  const code = String(body.code ?? "").trim();
  if (!code) {
    return NextResponse.json({ valid: false, error: "Missing referral code." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ valid: false, error: "Server configuration error." }, { status: 503 });
  }

  const auth = await resolveBookingRouteBearerAuth(request);
  const userId = auth.kind === "authenticated" ? auth.userId : null;
  const customerEmail =
    auth.kind === "authenticated"
      ? auth.email
      : String(body.email ?? "").trim();

  const result = await validateReferralForCheckout({
    admin,
    code,
    userId,
    customerEmail,
  });

  if (!result.valid) {
    return NextResponse.json({ valid: false });
  }

  return NextResponse.json({
    valid: true,
    code: result.normalizedCode,
    discountZar: result.discountZar,
  });
}
