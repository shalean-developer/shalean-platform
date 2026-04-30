import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { BOOKING_ROSTER_LOCKED_HINT } from "@/lib/admin/bookingRosterLockedMessage";
import {
  type RosterReplaceMemberInput,
  validateMembersToReplaceBookingCleanersRpcRows,
} from "@/lib/admin/bookingRosterReplacePayload";
import { scheduleStuckEarningsRecomputeDebounced } from "@/lib/cleaner/scheduleStuckEarningsRecompute";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin(request: Request): Promise<
  { ok: true; email: string | null } | { ok: false; status: number; error: string }
> {
  const authHeader = request.headers.get("authorization");
  const token = authHeader?.replace(/^Bearer\s+/i, "").trim() ?? "";
  if (!token) return { ok: false, status: 401, error: "Missing authorization." };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { ok: false, status: 503, error: "Server configuration error." };

  const pub = createClient(url, anon);
  const {
    data: { user },
  } = await pub.auth.getUser(token);
  if (!user?.email || !isAdmin(user.email)) {
    return { ok: false, status: 403, error: "Forbidden." };
  }
  return { ok: true, email: user.email };
}

export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, city_id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const { data: rows, error: rErr } = await admin
    .from("booking_cleaners")
    .select("id, booking_id, cleaner_id, role, assigned_at, payout_weight, lead_bonus_cents, source, created_at")
    .eq("booking_id", bookingId)
    .order("role", { ascending: true })
    .order("cleaner_id", { ascending: true });
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 });

  const cleanerIds = [...new Set((rows ?? []).map((r) => String((r as { cleaner_id?: string }).cleaner_id ?? "")))].filter(
    Boolean,
  );
  let cleanerNames = new Map<string, string>();
  if (cleanerIds.length > 0) {
    const { data: cleaners } = await admin.from("cleaners").select("id, full_name").in("id", cleanerIds);
    for (const c of cleaners ?? []) {
      const row = c as { id: string; full_name: string | null };
      cleanerNames.set(row.id, row.full_name?.trim() || row.id);
    }
  }

  const roster = (rows ?? []).map((raw) => {
    const r = raw as {
      id: string;
      booking_id: string;
      cleaner_id: string;
      role: string;
      assigned_at: string;
      payout_weight: number;
      lead_bonus_cents: number;
      source: string | null;
      created_at: string;
    };
    return {
      ...r,
      cleaner_name: cleanerNames.get(r.cleaner_id) ?? null,
    };
  });

  const reqUrl = new URL(request.url);
  const includeAvailable = reqUrl.searchParams.get("include_available") === "1";
  let available_cleaners: Array<{ id: string; full_name: string | null; status: string | null }> = [];
  if (includeAvailable) {
    const cityId = String((booking as { city_id?: string | null }).city_id ?? "").trim();
    let q = admin.from("cleaners").select("id, full_name, status").order("full_name", { ascending: true }).limit(400);
    if (cityId) q = q.eq("city_id", cityId);
    const { data: ac } = await q;
    available_cleaners = (ac ?? []) as typeof available_cleaners;
  }

  return NextResponse.json({
    booking_id: bookingId,
    booking_cleaners: roster,
    available_cleaners,
  });
}

export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { members?: unknown[] };
  try {
    body = (await request.json()) as { members?: unknown[] };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const members = (Array.isArray(body.members) ? body.members : []) as RosterReplaceMemberInput[];
  const built = validateMembersToReplaceBookingCleanersRpcRows(members, { defaultSource: "api" });
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: built.status });
  }
  const rpcRows = built.rows;

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, status")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const st = String((booking as { status?: string | null }).status ?? "").toLowerCase();
  if (st === "pending_payment" || st === "payment_expired") {
    return NextResponse.json(
      { error: "Awaiting customer payment — edit roster after the customer has paid." },
      { status: 400 },
    );
  }

  const { error: rpcErr } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
    p_booking_id: bookingId,
    p_rows: rpcRows,
  });
  if (rpcErr) {
    const msg = rpcErr.message ?? "";
    const locked = /finalized|roster locked|cleaner_line_earnings_finalized/i.test(msg);
    return NextResponse.json(
      { error: msg, ...(locked ? { hint: BOOKING_ROSTER_LOCKED_HINT } : {}) },
      { status: locked ? 409 : 400 },
    );
  }

  const leadId = rpcRows.find((r) => r.role === "lead")?.cleaner_id ?? "";
  if (leadId) {
    scheduleStuckEarningsRecomputeDebounced({
      admin,
      bookingId,
      cleanerId: leadId,
      recomputeSource: "admin_booking_roster_replace",
    });
  }

  const { data: rows } = await admin
    .from("booking_cleaners")
    .select("id, booking_id, cleaner_id, role, assigned_at, payout_weight, lead_bonus_cents, source, created_at")
    .eq("booking_id", bookingId)
    .order("role", { ascending: true })
    .order("cleaner_id", { ascending: true });

  return NextResponse.json({ ok: true, booking_cleaners: rows ?? [] });
}
