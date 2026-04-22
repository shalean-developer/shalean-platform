import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getOrCreateCleanerReferralCode } from "@/lib/referrals/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const cleanerId = session.cleanerId;

  const referralCode = await getOrCreateCleanerReferralCode(admin, cleanerId);
  const [rowsRes, cleanerRes] = await Promise.all([
    admin.from("referrals").select("id, status, reward_amount, created_at").eq("referrer_type", "cleaner").eq("referrer_id", cleanerId).order("created_at", { ascending: false }).limit(200),
    admin.from("cleaners").select("bonus_payout_zar").eq("id", cleanerId).maybeSingle(),
  ]);
  if (rowsRes.error) return NextResponse.json({ error: rowsRes.error.message }, { status: 500 });
  if (cleanerRes.error) return NextResponse.json({ error: cleanerRes.error.message }, { status: 500 });

  const rows = rowsRes.data ?? [];
  const totalEarned = rows
    .filter((r) => String(r.status).toLowerCase() === "completed")
    .reduce((s, r) => s + Number(r.reward_amount ?? 0), 0);
  const count = rows.filter((r) => String(r.status).toLowerCase() === "completed").length;
  const bonusPayout = Number((cleanerRes.data as { bonus_payout_zar?: number } | null)?.bonus_payout_zar ?? 0);

  return NextResponse.json({ referralCode, totalEarned, referralsCount: count, bonusPayout });
}
