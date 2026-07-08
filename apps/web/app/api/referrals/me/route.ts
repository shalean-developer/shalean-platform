import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getOrCreateCustomerReferralCode } from "@/lib/referrals/server";
import { getCreditSummary } from "@/lib/referrals/credits";
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
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const userId = userData.user.id;

  const referralCode = await getOrCreateCustomerReferralCode(admin, userId);
  const [rowsRes, creditSummary] = await Promise.all([
    admin
      .from("referrals")
      .select("id, status, reward_amount, created_at, code, referred_email_or_phone, rewarded_at")
      .eq("referrer_type", "customer")
      .eq("referrer_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    getCreditSummary(admin, userId),
  ]);
  if (rowsRes.error) return NextResponse.json({ error: rowsRes.error.message }, { status: 500 });

  const rows = rowsRes.data ?? [];
  const isRewarded = (s: string) => {
    const x = s.toLowerCase();
    return x === "completed" || x === "rewarded";
  };
  const isPending = (s: string) => s.toLowerCase() === "pending";
  const successfulReferrals = rows.filter((r) => isRewarded(String(r.status ?? "")));
  const pendingReferrals = rows.filter((r) => isPending(String(r.status ?? "")));
  const totalEarned = successfulReferrals.reduce((s, r) => s + Number(r.reward_amount ?? 0), 0);

  return NextResponse.json({
    referralCode,
    totalEarned,
    referralsCount: successfulReferrals.length,
    creditBalance: creditSummary.balance,
    creditUsed: creditSummary.totalUsed,
    totalReferrals: rows.length,
    pendingReferrals: pendingReferrals.length,
    successfulReferrals: successfulReferrals.length,
    referralHistory: rows.map((r) => ({
      id: r.id,
      status: r.status,
      rewardAmount: Number(r.reward_amount ?? 0),
      referredContact: (r as { referred_email_or_phone?: string }).referred_email_or_phone ?? null,
      createdAt: r.created_at,
      rewardedAt: (r as { rewarded_at?: string | null }).rewarded_at ?? null,
    })),
  });
}
