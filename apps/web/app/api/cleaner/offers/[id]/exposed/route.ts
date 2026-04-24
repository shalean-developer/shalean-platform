import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { compactDispatchMetricTags, loadDispatchMetricSegmentation } from "@/lib/dispatch/dispatchMetricContext";
import { claimOfferExposureDedupe } from "@/lib/dispatch/offerExposureDedupe";
import { sanitizeCleanerUxVariant } from "@/lib/cleaner/cleanerOfferUxVariant";
import { metrics } from "@/lib/metrics/counters";
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

  const { data: offer, error } = await admin
    .from("dispatch_offers")
    .select("id, booking_id, cleaner_id, status, ux_variant")
    .eq("id", offerId)
    .maybeSingle();

  if (error || !offer) return NextResponse.json({ error: "Offer not found." }, { status: 404 });
  const row = offer as { cleaner_id?: string; status?: string; booking_id?: string; ux_variant?: string | null };
  if (String(row.cleaner_id) !== session.cleanerId) return NextResponse.json({ error: "Not your offer." }, { status: 403 });
  if (String(row.status) !== "pending") return NextResponse.json({ error: "Offer not pending." }, { status: 400 });

  const bookingId = String(row.booking_id ?? "");
  if (!bookingId) return NextResponse.json({ error: "Invalid offer." }, { status: 400 });

  const claimed = await claimOfferExposureDedupe(admin, offerId);
  if (!claimed) {
    return NextResponse.json({ ok: true, deduped: true });
  }

  const seg = await loadDispatchMetricSegmentation(admin, bookingId);
  const metricTags = compactDispatchMetricTags({
    assignment_type: seg.assignment_type,
    fallback_reason: seg.fallback_reason,
    attempt_number: seg.attempt_number,
    location: seg.location,
    offer_cohort_tags: true,
  });
  const ux_variant = sanitizeCleanerUxVariant(row.ux_variant);

  metrics.increment("dispatch.offer.exposed", {
    bookingId,
    cleanerId: session.cleanerId,
    offerId,
    ux_variant,
    ...metricTags,
  });

  return NextResponse.json({ ok: true });
}
