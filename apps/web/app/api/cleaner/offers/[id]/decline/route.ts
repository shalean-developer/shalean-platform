import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { rejectDispatchOffer } from "@/lib/dispatch/dispatchOffers";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * M-17: this route MUST NOT call `ensureBookingAssignment` after `rejectDispatchOffer`.
 * Redispatch on decline is owned by `rejectDispatchOffer` →
 * `maybeRedispatchPendingBookingIfOffersExhausted`, which CAS-dedups concurrent decline
 * signals. A second `ensureBookingAssignment` here would cause duplicate offers,
 * duplicate cleaner notifications, inflated `dispatch.assignment.attempt` metrics, and
 * (worse) wouldn't pass `excludeCleanerIds`, so the just-rejecting cleaner could be
 * re-picked.
 */
export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: offerId } = await ctx.params;
  if (!offerId) return NextResponse.json({ error: "Missing offer id." }, { status: 400 });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });

  const r = await rejectDispatchOffer({ supabase: admin, offerId, cleanerId: session.cleanerId });
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.error.includes("Not your") ? 403 : 400 });

  return NextResponse.json({ ok: true, status: "declined" });
}
