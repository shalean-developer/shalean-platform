import { NextResponse } from "next/server";
import { resolveCleanerIdFromRequest } from "@/lib/cleaner/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { optionalCentsFromDb } from "@/lib/cleaner/cleanerJobDisplayEarningsResolve";
import { resolveCleanerEarningsCents } from "@/lib/cleaner/resolveCleanerEarnings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  const session = await resolveCleanerIdFromRequest(request, admin);
  if (!session.cleanerId) return NextResponse.json({ error: session.error ?? "Unauthorized." }, { status: session.status ?? 401 });
  const cleanerId = session.cleanerId;

  const { data: offersRaw, error } = await admin
    .from("dispatch_offers")
    .select(
      "id, booking_id, cleaner_id, status, expires_at, created_at, ux_variant, dispatch_tier, dispatch_visible_at, dispatch_tier_window_end_at, offer_token, sms_sent_at",
    )
    .eq("cleaner_id", cleanerId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(40);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const nowMs = Date.now();
  const offers = (offersRaw ?? [])
    .filter((o) => {
      const raw = (o as { dispatch_visible_at?: string | null }).dispatch_visible_at;
      if (raw == null || raw === "") return true;
      const t = new Date(raw).getTime();
      return !Number.isFinite(t) || t <= nowMs;
    })
    .slice(0, 20);

  const bookingIds = offers.map((o) => String(o.booking_id)).filter(Boolean);
  let bookingById = new Map<string, Record<string, unknown>>();
  if (bookingIds.length > 0) {
    const { data: rows } = await admin
      .from("bookings")
      .select(
        "id, service, date, time, location, customer_name, customer_phone, status, total_paid_zar, amount_paid_cents, is_team_job, team_id, team_member_count_snapshot, display_earnings_cents, cleaner_earnings_total_cents, cleaner_payout_cents, booking_snapshot, payout_frozen_cents",
      )
      .in("id", bookingIds);
    bookingById = new Map((rows ?? []).map((r) => [String((r as { id: string }).id), r as Record<string, unknown>]));
  }

  const offersOut = offers
    .map((o) => {
      const booking = bookingById.get(String(o.booking_id)) ?? null;
      const displayEarningsCents =
        booking == null
          ? null
          : resolveCleanerEarningsCents({
              cleaner_earnings_total_cents: booking.cleaner_earnings_total_cents,
              payout_frozen_cents: booking.payout_frozen_cents,
              display_earnings_cents: optionalCentsFromDb(booking.display_earnings_cents),
            });
      const displayEarningsIsEstimate = false;
      const safeBooking =
        booking == null
          ? null
          : {
              id: booking.id,
              service: booking.service ?? null,
              date: booking.date ?? null,
              time: booking.time ?? null,
              location: booking.location ?? null,
              customer_name: booking.customer_name ?? null,
              customer_phone: booking.customer_phone ?? null,
              status: booking.status ?? null,
              total_paid_zar: booking.total_paid_zar ?? null,
              is_team_job: booking.is_team_job === true,
              team_id: (booking.team_id as string | null | undefined) ?? null,
              teamMemberCount:
                typeof booking.team_member_count_snapshot === "number" &&
                Number.isFinite(booking.team_member_count_snapshot) &&
                booking.team_member_count_snapshot > 0
                  ? Math.floor(booking.team_member_count_snapshot)
                  : null,
              booking_snapshot: booking.booking_snapshot ?? null,
            };
      return {
        ...o,
        displayEarningsCents,
        displayEarningsIsEstimate,
        earnings_cents: displayEarningsCents,
        earnings_estimated: displayEarningsIsEstimate,
        booking: safeBooking,
      };
    });

  return NextResponse.json({ offers: offersOut });
}
