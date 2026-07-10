import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { runBirthdayRewardsCron } from "@/lib/promotions/birthday";
import { syncPromotionStatuses } from "@/lib/promotions/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily: sync promotion statuses + issue birthday credits. */
export async function POST(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const activated = await syncPromotionStatuses(admin);
  const birthday = await runBirthdayRewardsCron(admin);

  return NextResponse.json({ ok: true, activated, birthday });
}
