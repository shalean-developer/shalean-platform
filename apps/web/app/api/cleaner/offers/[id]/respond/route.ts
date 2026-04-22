import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
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
  const normalizedAction = action === "decline" ? "reject" : action;
  if (normalizedAction !== "accept" && normalizedAction !== "reject") {
    return NextResponse.json({ error: "Invalid action. Use accept or reject/decline." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const cleanerId = session.cleanerId;

  if (normalizedAction === "accept") {
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
