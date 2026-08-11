import { NextResponse } from "next/server";
import { runPayoutFundingGapAlert } from "@/lib/payout/payoutFundingAlerts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = String(process.env.CRON_SECRET ?? "").trim();
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  try {
    const result = await runPayoutFundingGapAlert(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Payout funding alert failed.";
    console.error("[cron/payout-funding-gap-alert]", message, e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
