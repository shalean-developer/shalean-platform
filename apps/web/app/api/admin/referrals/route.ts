import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const pub = createClient(url, anon);
  const { data: userData } = await pub.auth.getUser(token);
  if (!userData.user?.email || !isAdmin(userData.user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const [rewardRows, checkoutSummary] = await Promise.all([
    admin
      .from("referrals")
      .select(
        "id, referrer_id, referrer_type, referred_email_or_phone, referred_user_id, status, reward_amount, created_at, completed_at, rewarded_at, code",
      )
      .order("created_at", { ascending: false })
      .limit(2000),
    admin.from("admin_referral_checkout_redemption_summary").select("referral_code, redemption_count, total_discount_zar"),
  ]);

  if (rewardRows.error) return NextResponse.json({ error: rewardRows.error.message }, { status: 500 });
  if (checkoutSummary.error) {
    return NextResponse.json({ error: checkoutSummary.error.message }, { status: 500 });
  }

  const checkoutDiscounts = (checkoutSummary.data ?? []).map((row) => ({
    referralCode: String((row as { referral_code?: string }).referral_code ?? ""),
    redemptionCount: Number((row as { redemption_count?: number | string }).redemption_count ?? 0),
    totalDiscountZar: Number((row as { total_discount_zar?: number | string }).total_discount_zar ?? 0),
  }));

  checkoutDiscounts.sort((a, b) => b.totalDiscountZar - a.totalDiscountZar);

  return NextResponse.json({
    referrals: rewardRows.data ?? [],
    checkoutDiscounts,
  });
}
