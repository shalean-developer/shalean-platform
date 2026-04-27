import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { learnGrowthEffectiveness } from "@/lib/growth/growthActionOutcomes";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin: aggregated growth action → conversion → revenue (closed-loop learning input).
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

  const { searchParams } = new URL(request.url);
  const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sinceIso = searchParams.get("since")?.trim() || defaultSince;
  const actionType = searchParams.get("action_type")?.trim() || undefined;
  const channel = searchParams.get("channel")?.trim();
  const ch =
    channel === "email" || channel === "whatsapp" || channel === "sms"
      ? channel
      : undefined;

  const rows = await learnGrowthEffectiveness(admin, {
    sinceIso,
    actionType,
    channel: ch,
  });

  return NextResponse.json({ since: sinceIso, rows });
}
