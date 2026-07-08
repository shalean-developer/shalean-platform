import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getReferralProgramSettings } from "@/lib/referrals/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public read-only settings for the referral landing page. */
export async function GET() {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const settings = await getReferralProgramSettings(admin);
  return NextResponse.json({
    enabled: settings.enabled,
    rewardAmountZar: settings.rewardAmountZar,
    checkoutDiscountZar: settings.checkoutDiscountZar,
    heroHeadline: settings.heroHeadline,
    heroSubheading: settings.heroSubheading,
    promotionalText: settings.promotionalText,
    termsAndConditions: settings.termsAndConditions,
  });
}
