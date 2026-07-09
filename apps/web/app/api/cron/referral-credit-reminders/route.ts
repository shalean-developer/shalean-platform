import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processReferralCreditExpiryReminders } from "@/lib/referrals/referralRewardEmails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily cron — remind referrers before referral cleaning credit expires. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await processReferralCreditExpiryReminders(admin);
  return NextResponse.json({ ok: true, ...result });
}
