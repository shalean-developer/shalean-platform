import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { countActiveTeamMembersOnDate } from "@/lib/cleaner/teamMemberAvailability";
import { isAdmin } from "@/lib/auth/admin";
import { isTeamService } from "@/lib/dispatch/assignBooking";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { BOOKING_PAYOUT_COLUMNS_CLEAR } from "@/lib/payout/bookingPayoutColumns";
import { persistCleanerPayoutIfUnset } from "@/lib/payout/persistCleanerPayout";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) {
    return NextResponse.json({ error: "Missing booking id." }, { status: 400 });
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
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Server configuration error." }, { status: 503 });
  }

  const { data: booking, error } = await admin
    .from("bookings")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!booking) {
    return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  }

  const cleanerId = typeof booking.cleaner_id === "string" ? booking.cleaner_id : null;
  const userId = typeof booking.user_id === "string" ? booking.user_id : null;

  const cleanerPromise = cleanerId
    ? admin
        .from("cleaners")
        .select("id, full_name, email, phone, status, rating")
        .eq("id", cleanerId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const userProfilePromise = userId
    ? admin
        .from("user_profiles")
        .select("id, email, full_name, phone, tier")
        .eq("id", userId)
        .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const offersPromise = admin
    .from("dispatch_offers")
    .select("id, cleaner_id, status, rank_index, expires_at, created_at, responded_at, ux_variant")
    .eq("booking_id", id)
    .order("created_at", { ascending: false });

  const [{ data: cleaner }, { data: userProfile }, { data: dispatchOffers, error: offersErr }] = await Promise.all([
    cleanerPromise,
    userProfilePromise,
    offersPromise,
  ]);

  if (offersErr) {
    return NextResponse.json({ error: offersErr.message }, { status: 500 });
  }

  const b = booking as Record<string, unknown>;
  const supports_team_assignment = isTeamService({
    service: typeof b.service === "string" ? b.service : null,
    booking_snapshot: b.booking_snapshot,
  });

  let team_summary: { id: string; name: string; member_count: number | null } | null = null;
  const teamId = typeof b.team_id === "string" && b.team_id.trim() ? b.team_id.trim() : null;
  const dateYmd = typeof b.date === "string" ? b.date.trim().slice(0, 10) : "";
  if (teamId) {
    const { data: teamRow } = await admin.from("teams").select("id, name").eq("id", teamId).maybeSingle();
    if (teamRow && typeof teamRow === "object" && "id" in teamRow && "name" in teamRow) {
      let member_count: number | null = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) {
        const { data: mem } = await admin
          .from("team_members")
          .select("cleaner_id, active_from, active_to")
          .eq("team_id", teamId)
          .not("cleaner_id", "is", null);
        member_count = countActiveTeamMembersOnDate(mem ?? [], dateYmd);
      }
      team_summary = {
        id: String((teamRow as { id: string }).id),
        name: String((teamRow as { name: string }).name),
        member_count,
      };
    }
  }

  return NextResponse.json({
    booking,
    cleaner: cleaner ?? null,
    userProfile: userProfile ?? null,
    dispatch_offers: dispatchOffers ?? [],
    supports_team_assignment,
    team_summary,
  });
}

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

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
  if (!user?.email || !isAdmin(user.email)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });

  let body: { status?: string; date?: string; time?: string; cleaner_id?: string | null };
  try {
    body = (await request.json()) as { status?: string; date?: string; time?: string; cleaner_id?: string | null };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const updates: Record<string, unknown> = {};

  if (body.status != null) {
    let status = String(body.status).trim().toLowerCase();
    if (status === "confirmed") status = "assigned";
    const allowed = new Set(["pending", "assigned", "in_progress", "completed", "cancelled", "failed"]);
    if (!allowed.has(status)) return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    updates.status = status;
  }
  if (body.date != null) {
    const date = String(body.date).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "Invalid date format." }, { status: 400 });
    updates.date = date;
  }
  if (body.time != null) {
    const time = String(body.time).trim();
    if (!/^\d{2}:\d{2}(:\d{2})?$/.test(time)) return NextResponse.json({ error: "Invalid time format." }, { status: 400 });
    updates.time = time.length === 5 ? `${time}:00` : time;
  }
  if ("cleaner_id" in body) {
    if (body.cleaner_id === null || body.cleaner_id === "") {
      updates.cleaner_id = null;
    } else if (typeof body.cleaner_id === "string") {
      const cid = body.cleaner_id.trim();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cid)) {
        return NextResponse.json({ error: "Invalid cleaner_id." }, { status: 400 });
      }
      updates.cleaner_id = cid;
    }
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields provided." }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: before } = await admin.from("bookings").select("user_id, cleaner_id").eq("id", id).maybeSingle();
  const oldCleaner =
    before && typeof before === "object"
      ? String((before as { cleaner_id?: string | null }).cleaner_id ?? "").trim() || null
      : null;
  const newCleaner =
    "cleaner_id" in updates && typeof updates.cleaner_id === "string" && updates.cleaner_id.trim().length > 0
      ? updates.cleaner_id.trim()
      : null;
  const cleanerWasChanged = "cleaner_id" in updates && newCleaner !== oldCleaner;
  if (cleanerWasChanged) {
    Object.assign(updates, BOOKING_PAYOUT_COLUMNS_CLEAR);
    await logSystemEvent({
      level: "info",
      source: "admin_booking_reassignment",
      message: "Reassignment triggers payout recalculation",
      context: {
      bookingId: id,
      oldCleanerId: oldCleaner,
      newCleanerId: newCleaner,
      },
    });
  }

  const { error } = await admin.from("bookings").update(updates).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (newCleaner && cleanerWasChanged) {
    await notifyCleanerAssignedBooking(admin, id, newCleaner);
  }
  const completedViaPatch = updates.status === "completed";
  const effectiveCleaner = newCleaner ?? oldCleaner;
  if (completedViaPatch && effectiveCleaner) {
    try {
      const payout = await persistCleanerPayoutIfUnset({ admin, bookingId: id, cleanerId: effectiveCleaner });
      if (!payout.ok) {
        await logSystemEvent({
          level: "error",
          source: "admin_booking_completed",
          message: `Payout missing after admin completion: ${payout.error}`,
          context: { bookingId: id, cleanerId: effectiveCleaner },
        });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("admin bookings PATCH persistCleanerPayoutIfUnset", { bookingId: id, cleanerId: effectiveCleaner, error: msg });
      await logSystemEvent({
        level: "error",
        source: "admin_booking_completed",
        message: `Payout persist threw after admin completion: ${msg}`,
        context: { bookingId: id, cleanerId: effectiveCleaner },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
