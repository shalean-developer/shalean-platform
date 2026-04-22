import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { acceptDispatchOffer, rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await ctx.params;
  if (!offerId) {
    return NextResponse.json({ error: "Missing offer id." }, { status: 400 });
  }

  let body: { action?: string };
  try {
    body = (await request.json()) as { action?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : "";
  if (action !== "accept" && action !== "reject") {
    return NextResponse.json({ error: "Invalid action. Use accept or reject." }, { status: 400 });
  }

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) {
    return NextResponse.json({ error: "Missing authorization." }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const pub = createClient(url, anon);
  const { data: userData, error: userErr } = await pub.auth.getUser(token);
  if (userErr || !userData.user?.id) {
    return NextResponse.json({ error: "Invalid or expired session." }, { status: 401 });
  }

  const cleanerId = userData.user.id;
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  if (action === "accept") {
    const r = await acceptDispatchOffer({ supabase: admin, offerId, cleanerId });
    if (!r.ok) {
      return NextResponse.json({ error: r.error }, { status: r.error.includes("Not your") ? 403 : 400 });
    }
    return NextResponse.json({ ok: true, status: "accepted" });
  }

  const r = await rejectDispatchOffer({ supabase: admin, offerId, cleanerId });
  if (!r.ok) {
    return NextResponse.json({ error: r.error }, { status: r.error.includes("Not your") ? 403 : 400 });
  }
  return NextResponse.json({ ok: true, status: "rejected" });
}
