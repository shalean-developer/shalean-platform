import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getOrCreateCustomerReferralCode } from "@/lib/referrals/server";
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
  const [rowsRes, profileRes] = await Promise.all([
    admin.from("referrals").select("id, status, reward_amount, created_at").eq("referrer_type", "customer").eq("referrer_id", userId).order("created_at", { ascending: false }).limit(200),
    admin.from("user_profiles").select("credit_balance_zar").eq("id", userId).maybeSingle(),
  ]);
  if (rowsRes.error) return NextResponse.json({ error: rowsRes.error.message }, { status: 500 });
  if (profileRes.error) return NextResponse.json({ error: profileRes.error.message }, { status: 500 });

  const rows = rowsRes.data ?? [];
  const totalEarned = rows
    .filter((r) => String(r.status).toLowerCase() === "completed")
    .reduce((s, r) => s + Number(r.reward_amount ?? 0), 0);
  const count = rows.filter((r) => String(r.status).toLowerCase() === "completed").length;
  const creditBalance = Number((profileRes.data as { credit_balance_zar?: number } | null)?.credit_balance_zar ?? 0);

  return NextResponse.json({ referralCode, totalEarned, referralsCount: count, creditBalance });
}
