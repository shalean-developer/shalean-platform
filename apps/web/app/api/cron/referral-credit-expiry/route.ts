import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { processExpiredReferralCredits } from "@/lib/referrals/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily cron — expire referral cleaning credits past credit_expires_at (08:30 SAST / 06:30 UTC). */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const result = await processExpiredReferralCredits(admin);
  return NextResponse.json({ ok: true, ...result });
}
