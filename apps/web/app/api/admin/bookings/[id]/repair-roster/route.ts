import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { syncBookingCleanersForTeamBooking } from "@/lib/booking/syncBookingCleanersForTeamBooking";
import { isAdmin } from "@/lib/auth/admin";
import { BOOKING_ROSTER_LOCKED_HINT } from "@/lib/admin/bookingRosterLockedMessage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return NextResponse.json({ error: "Missing authorization." }, { status: 401 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: b, error: bErr } = await admin
    .from("bookings")
    .select("id, is_team_job, team_id, cleaner_line_earnings_finalized_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!b) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const row = b as {
    is_team_job?: boolean | null;
    team_id?: string | null;
    cleaner_line_earnings_finalized_at?: string | null;
  };
  if (row.is_team_job !== true || !String(row.team_id ?? "").trim()) {
    return NextResponse.json(
      { error: "Repair roster only applies to team jobs with a team_id." },
      { status: 400 },
    );
  }
  const fin = row.cleaner_line_earnings_finalized_at;
  if (fin != null && String(fin).trim() !== "") {
    return NextResponse.json(
      {
        error:
          "Roster cannot be rebuilt while cleaner line earnings are finalized. Use the reopen earnings flow first.",
        hint: BOOKING_ROSTER_LOCKED_HINT,
      },
      { status: 409 },
    );
  }

  const sync = await syncBookingCleanersForTeamBooking(admin, bookingId, "admin");
  if (!sync.ok) {
    const locked =
      /finalized|roster locked|cleaner_line_earnings_finalized/i.test(sync.message) ||
      sync.message.toLowerCase().includes("earnings finalized");
    return NextResponse.json(
      { error: sync.message, ...(locked ? { hint: BOOKING_ROSTER_LOCKED_HINT } : {}) },
      { status: locked ? 409 : 500 },
    );
  }

  const { data: roster, error: rErr } = await admin
    .from("booking_cleaners")
    .select("id, cleaner_id, role, payout_weight, lead_bonus_cents, source")
    .eq("booking_id", bookingId)
    .order("cleaner_id", { ascending: true });
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, booking_cleaners: roster ?? [] });
}
