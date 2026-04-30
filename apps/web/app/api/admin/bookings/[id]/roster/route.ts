import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth/admin";
import { BOOKING_ROSTER_LOCKED_HINT } from "@/lib/admin/bookingRosterLockedMessage";
import {
  type PreserveCleanerPayout,
  type RosterReplaceMemberInput,
  validateMembersToReplaceBookingCleanersRpcRows,
} from "@/lib/admin/bookingRosterReplacePayload";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
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
  return { ok: true, email: user.email ?? null };
}

type CleanerRow = { cleaner_id: string; role: string; payout_weight?: number; lead_bonus_cents?: number; source?: string | null };

function isFinalizedAt(raw: unknown): boolean {
  if (raw == null) return false;
  const s = String(raw).trim();
  return s.length > 0;
}

async function loadRosterRows(admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>, bookingId: string) {
  const { data: rows, error } = await admin
    .from("booking_cleaners")
    .select("cleaner_id, role, payout_weight, lead_bonus_cents, source")
    .eq("booking_id", bookingId)
    .order("role", { ascending: true })
    .order("cleaner_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (rows ?? []) as CleanerRow[];
}

async function attachNames(
  admin: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  roster: CleanerRow[],
): Promise<Array<{ cleaner_id: string; role: string; name: string | null }>> {
  const ids = [...new Set(roster.map((r) => r.cleaner_id).filter(Boolean))];
  const names = new Map<string, string | null>();
  if (ids.length > 0) {
    const { data: cleaners, error } = await admin.from("cleaners").select("id, full_name").in("id", ids);
    if (error) throw new Error(error.message);
    for (const c of cleaners ?? []) {
      const row = c as { id: string; full_name: string | null };
      names.set(row.id, row.full_name?.trim() ? row.full_name.trim() : null);
    }
  }
  return roster.map((r) => ({
    cleaner_id: r.cleaner_id,
    role: String(r.role ?? "").toLowerCase(),
    name: names.get(r.cleaner_id) ?? null,
  }));
}

function buildPreserveMap(rows: CleanerRow[]): Map<string, PreserveCleanerPayout> {
  const m = new Map<string, PreserveCleanerPayout>();
  for (const r of rows) {
    const id = String(r.cleaner_id ?? "").trim();
    if (!id) continue;
    const pw = Number(r.payout_weight ?? 1);
    const lb = Math.floor(Number(r.lead_bonus_cents ?? 0));
    m.set(id, {
      payout_weight: Number.isFinite(pw) && pw > 0 ? pw : 1,
      lead_bonus_cents: Number.isFinite(lb) && lb >= 0 ? lb : 0,
      source: r.source ?? null,
    });
  }
  return m;
}

/**
 * PUT — emergency roster replace (canonical `booking_cleaners`).
 * Body: `{ members: [{ cleanerId, role }], reason: string }`
 */
export async function PUT(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: bookingId } = await ctx.params;
  if (!bookingId) return NextResponse.json({ error: "Missing booking id." }, { status: 400 });

  const auth = await requireAdmin(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: { members?: unknown[]; reason?: unknown };
  try {
    body = (await request.json()) as { members?: unknown[]; reason?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reasonRaw.length < 2) {
    return NextResponse.json({ error: "reason is required (at least 2 characters)." }, { status: 400 });
  }
  const reason = reasonRaw.slice(0, 2000);

  const members = (Array.isArray(body.members) ? body.members : []) as RosterReplaceMemberInput[];

  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ error: "Server configuration error." }, { status: 503 });

  const { data: booking, error: bErr } = await admin
    .from("bookings")
    .select("id, status, cleaner_line_earnings_finalized_at")
    .eq("id", bookingId)
    .maybeSingle();
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

  const fin = (booking as { cleaner_line_earnings_finalized_at?: string | null }).cleaner_line_earnings_finalized_at;
  if (isFinalizedAt(fin)) {
    return NextResponse.json(
      {
        error: "Roster is locked — cleaner line earnings are finalized for this booking.",
        hint: BOOKING_ROSTER_LOCKED_HINT,
        code: "roster_finalized",
      },
      { status: 409 },
    );
  }

  const st = String((booking as { status?: string | null }).status ?? "").toLowerCase();
  if (st === "pending_payment" || st === "payment_expired") {
    return NextResponse.json(
      { error: "Awaiting customer payment — edit roster after the customer has paid." },
      { status: 400 },
    );
  }

  let existingRows: CleanerRow[];
  try {
    existingRows = await loadRosterRows(admin, bookingId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load roster.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const preserveByCleanerId = buildPreserveMap(existingRows);

  let oldRosterAudit: Array<{ cleaner_id: string; role: string; name: string | null }>;
  try {
    oldRosterAudit = await attachNames(admin, existingRows);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed to load roster names.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const built = validateMembersToReplaceBookingCleanersRpcRows(members, {
    preserveByCleanerId,
    defaultSource: "admin",
  });
  if (!built.ok) {
    return NextResponse.json({ error: built.error }, { status: built.status });
  }
  const rpcRows = built.rows;

  const { error: rpcErr } = await admin.rpc("replace_booking_cleaners_admin_atomic", {
    p_booking_id: bookingId,
    p_rows: rpcRows,
  });
  if (rpcErr) {
    const msg = rpcErr.message ?? "";
    const locked = /finalized|roster locked|cleaner_line_earnings_finalized/i.test(msg);
    return NextResponse.json(
      { error: msg, ...(locked ? { hint: BOOKING_ROSTER_LOCKED_HINT, code: "roster_finalized" } : {}) },
      { status: locked ? 409 : 400 },
    );
  }

  const { data: rowsAfter, error: rowsErr } = await admin
    .from("booking_cleaners")
    .select("id, booking_id, cleaner_id, role, assigned_at, payout_weight, lead_bonus_cents, source, created_at")
    .eq("booking_id", bookingId)
    .order("role", { ascending: true })
    .order("cleaner_id", { ascending: true });
  if (rowsErr) return NextResponse.json({ error: rowsErr.message }, { status: 500 });

  const rosterAfter = (rowsAfter ?? []) as CleanerRow[];

  let newRosterAudit: Array<{ cleaner_id: string; role: string; name: string | null }>;
  try {
    newRosterAudit = await attachNames(admin, rosterAfter);
  } catch {
    newRosterAudit = rosterAfter.map((r) => ({
      cleaner_id: r.cleaner_id,
      role: String(r.role ?? "").toLowerCase(),
      name: null,
    }));
  }

  const { error: evErr } = await admin.from("booking_events").insert({
    session_id: `admin_booking:${bookingId}`,
    step: "admin_support",
    event_type: "roster_changed",
    metadata: {
      type: "roster_changed",
      booking_id: bookingId,
      reason,
      admin_email: auth.email,
      old_roster: oldRosterAudit,
      new_roster: newRosterAudit,
    },
  });
  if (evErr) {
    return NextResponse.json(
      {
        error: "Roster was updated but audit logging failed.",
        detail: evErr.message,
        code: "audit_insert_failed",
      },
      { status: 500 },
    );
  }

  const leadId = rpcRows.find((r) => r.role === "lead")?.cleaner_id ?? "";
  if (leadId) {
    scheduleStuckEarningsRecomputeDebounced({
      admin,
      bookingId,
      cleanerId: leadId,
      recomputeSource: "admin_booking_roster_emergency_put",
    });
  }

  const cleanerIds = [...new Set(rosterAfter.map((r) => String(r.cleaner_id ?? "")))].filter(Boolean);
  const cleanerNames = new Map<string, string>();
  if (cleanerIds.length > 0) {
    const { data: cleaners } = await admin.from("cleaners").select("id, full_name").in("id", cleanerIds);
    for (const c of cleaners ?? []) {
      const row = c as { id: string; full_name: string | null };
      cleanerNames.set(row.id, row.full_name?.trim() || row.id);
    }
  }

  const booking_cleaners = rosterAfter.map((r) => ({
    ...r,
    cleaner_name: cleanerNames.get(r.cleaner_id) ?? null,
  }));

  return NextResponse.json({ ok: true, booking_cleaners });
}
