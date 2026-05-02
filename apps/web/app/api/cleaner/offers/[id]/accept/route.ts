import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { acceptDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await ctx.params;
  if (!offerId) return NextResponse.json({ error: "Missing offer id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const r = await acceptDispatchOffer({
    supabase: admin,
    offerId,
    cleanerId: session.cleanerId,
  });
  if (!r.ok) {
    return NextResponse.json(
      { error: r.error, reason: r.machineReason },
      { status: r.error.includes("Not your") ? 403 : 400 },
    );
  }

  return NextResponse.json({ ok: true, status: "accepted" });
}
