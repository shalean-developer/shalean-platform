import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import {
  buildAdminReferralsReadModel,
  type AdminReferralsAudience,
} from "@/lib/admin/referralsReadModel";
import { loadReferralsDashboardExtras } from "@/lib/admin/referralsDashboardExtras";
import { requireAdminUser } from "@/lib/auth/evaluateAdminAccess";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseReferrerTypeParam(value: string | null): AdminReferralsAudience | undefined {
  if (value === "customer" || value === "cleaner") return value;
  return undefined;
}

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const pub = createClient(url, anon);
  const { data: userData } = await pub.auth.getUser(token);
  const adminAuth = await requireAdminUser(userData.user);
  if (!adminAuth.ok) return NextResponse.json({ error: adminAuth.error }, { status: adminAuth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const referrerType = parseReferrerTypeParam(new URL(request.url).searchParams.get("referrerType"));
  const audienceOptions = referrerType ? { referrerType } : undefined;

  const [readModel, checkoutSummary, dashboardExtras] = await Promise.all([
    buildAdminReferralsReadModel(admin, audienceOptions),
    admin.from("admin_referral_checkout_redemption_summary").select("referral_code, redemption_count, total_discount_zar"),
    loadReferralsDashboardExtras(admin, audienceOptions),
  ]);

  if (!readModel.ok) return NextResponse.json({ error: readModel.error }, { status: 500 });
  if (!dashboardExtras.ok) return NextResponse.json({ error: dashboardExtras.error }, { status: 500 });
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
    referrals: readModel.rows,
    checkoutDiscounts,
    dashboard: dashboardExtras.data,
  });
}
