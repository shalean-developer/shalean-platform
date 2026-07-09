import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processMonthlyReferralCampaign } from "@/lib/referrals/referralCampaignEmail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Monthly referral email cron — 1st of each month (09:00 SAST / 07:00 UTC). Campaign must be enabled in admin. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await processMonthlyReferralCampaign(admin);
  return NextResponse.json({ ok: true, ...result });
}
