import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { ensureBookingAssignment } from "@/lib/dispatch/ensureBookingAssignment";
import { rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";
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

  const { data: offer } = await admin
    .from("dispatch_offers")
    .select("booking_id")
    .eq("id", offerId)
    .maybeSingle();
  const bookingId = String((offer as { booking_id?: string } | null)?.booking_id ?? "");

  const r = await rejectDispatchOffer({ supabase: admin, offerId, cleanerId: session.cleanerId });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error.includes("Not your") ? 403 : 400 });

  if (bookingId) {
    await ensureBookingAssignment(admin, bookingId, {
      source: "offer_decline_redispatch",
      retryEscalation: 1,
    });
  }

  return NextResponse.json({ ok: true, status: "declined" });
}
