import { NextResponse } from "next/server";
import { resolveBookingRouteBearerAuth } from "@/lib/supabase/bookingRouteBearerAuth";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { validateReferralForCheckout } from "@/lib/referrals/validateReferral";
import { referralCheckoutInvalidMessage } from "@/lib/referrals/referralCheckoutReasons";
import { getReferralProgramSettingsCached } from "@/lib/referrals/settings";
import { buildReferralCheckoutFingerprint } from "@/lib/referrals/checkoutFingerprint";
import { resolveReferralClientIp } from "@/lib/referrals/clientIp";
import {
  checkReferralValidateIpLimit,
  recordReferralValidateFailure,
  referralRateLimitResponse,
} from "@/lib/rateLimit/referralPublicAbuseLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Validates a stored referral code for checkout and returns the discount amount. */
export async function POST(request: Request) {
  const ipDecision = checkReferralValidateIpLimit(request);
  if (!ipDecision.allowed) return referralRateLimitResponse(ipDecision);

  let body: { code?: string; email?: string; bookingTotalZar?: number; serviceSlug?: string };
  try {
    body = (await request.json()) as { code?: string; email?: string; bookingTotalZar?: number; serviceSlug?: string };
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
      ? (auth.email ?? "")
      : String(body.email ?? "").trim();

  const checkoutFingerprint = buildReferralCheckoutFingerprint({
    clientIp: resolveReferralClientIp(request),
    userAgent: request.headers.get("user-agent"),
  });

  const result = await validateReferralForCheckout({
    admin,
    code,
    userId,
    customerEmail,
    bookingTotalZar: body.bookingTotalZar != null ? Number(body.bookingTotalZar) : null,
    serviceSlug: body.serviceSlug ?? null,
    checkoutFingerprint,
  });

  if (!result.valid) {
    const failDecision = recordReferralValidateFailure(request);
    if (!failDecision.allowed) return referralRateLimitResponse(failDecision);
    const settings = await getReferralProgramSettingsCached(admin);
    return NextResponse.json({
      valid: false,
      reason: result.reason,
      message: referralCheckoutInvalidMessage(result.reason, {
        minBookingZar: settings.minBookingValueZar,
      }),
    });
  }

  return NextResponse.json({
    valid: true,
    code: result.normalizedCode,
    discountZar: result.discountZar,
  });
}
