import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseSpendZar(): number {
  const raw = Number(process.env.GROWTH_MARKETING_SPEND_ZAR_LAST_30D ?? "0");
  return Number.isFinite(raw) && raw > 0 ? raw : 0;
}

/**
 * Admin-only growth metrics (CAC proxy, LTV, retention, referral conversion).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const { data: userData } = await pub.auth.getUser(token);
  if (!userData.user?.email || !isAdmin(userData.user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const since90 = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [
    profilesRes,
    newUsersRes,
    referralCreatedRes,
    referralRewardedRes,
    activeBookersRes,
    segmentRes,
  ] = await Promise.all([
    admin.from("user_profiles").select("total_spent_cents", { count: "exact", head: true }),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_type", "customer")
      .gte("created_at", since30),
    admin
      .from("referrals")
      .select("id", { count: "exact", head: true })
      .eq("referrer_type", "customer")
      .eq("status", "rewarded")
      .gte("created_at", since30),
    admin
      .from("bookings")
      .select("user_id", { count: "exact", head: true })
      .not("user_id", "is", null)
      .gte("payment_completed_at", since90)
      .neq("status", "pending_payment")
      .neq("status", "payment_expired"),
    admin.from("customer_segment").select("user_id", { count: "exact", head: true }),
  ]);

  const profileCount = profilesRes.count ?? 0;

  const usersPage = newUsersRes.data?.users ?? [];
  const newCustomers30d = usersPage.filter((u) => {
    const created = u.created_at ? Date.parse(u.created_at) : 0;
    return Number.isFinite(created) && created >= Date.parse(since30);
  }).length;

  const marketingSpend = parseSpendZar();
  const cac_proxy_zar = newCustomers30d > 0 ? Math.round(marketingSpend / newCustomers30d) : null;

  const { data: spendRows } = await admin.from("user_profiles").select("total_spent_cents").limit(5000);
  const totals = spendRows ?? [];
  const sumSpent = totals.reduce((s, r) => s + Number((r as { total_spent_cents?: number }).total_spent_cents ?? 0), 0);
  const avg_ltv_cents = totals.length ? Math.round(sumSpent / totals.length) : 0;

  const retainedDenominator = profileCount || 1;
  const retention_rate_90d_approx = Math.min(1, (activeBookersRes.count ?? 0) / retainedDenominator);

  const created = referralCreatedRes.count ?? 0;
  const rewarded = referralRewardedRes.count ?? 0;
  const referral_conversion_rate_30d = created > 0 ? rewarded / created : null;

  return NextResponse.json({
    period: { since_30d_iso: since30, since_90d_iso: since90 },
    cac_proxy_zar,
    cac_note: "CAC proxy = GROWTH_MARKETING_SPEND_ZAR_LAST_30D / new auth users (first page, max 1000).",
    ltv: {
      avg_total_spent_cents: avg_ltv_cents,
      profile_sample_size: totals.length,
    },
    retention: {
      rate_paid_activity_90d_approx: Number(retention_rate_90d_approx.toFixed(4)),
      active_customer_bookings_90d: activeBookersRes.count ?? 0,
      user_profiles_total: profileCount,
    },
    referrals: {
      customer_pending_or_rewarded_created_30d: created,
      customer_rewarded_30d: rewarded,
      conversion_rate_30d: referral_conversion_rate_30d === null ? null : Number(referral_conversion_rate_30d.toFixed(4)),
    },
    segments: {
      rows: segmentRes.count ?? 0,
    },
  });
}
