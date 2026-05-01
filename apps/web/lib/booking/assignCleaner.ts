import type { SupabaseClient } from "@supabase/supabase-js";
import { FALLBACK_REASON_CLEANER_NOT_AVAILABLE } from "@/lib/booking/fallbackReason";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { notifyCleanerAssignedBooking } from "@/lib/dispatch/notifyCleanerAssigned";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Set `TRACE_BOOKING_ASSIGN=1` to log assignment decisions (stdout / host logs). */
function bookingAssignTrace(payload: Record<string, unknown>): void {
  if (process.env.TRACE_BOOKING_ASSIGN !== "1") return;
  try {
    console.log("[TRACE_BOOKING_ASSIGN]", JSON.stringify({ at: new Date().toISOString(), ...payload }));
  } catch {
    /* ignore */
  }
}

const SLOT_CONFLICT_STATUSES = ["assigned", "confirmed", "in_progress", "accepted", "on_the_way"];

export type AssignCleanerResult =
  | { ok: true; mode: "assigned"; cleanerId: string }
  | { ok: true; mode: "unassigned" }
  | { ok: true; mode: "skipped"; reason: "already_assigned" | "not_applicable_status" | "not_found" }
  | { ok: false; error: string };

export type BookingRowForAssignment = {
  id: string;
  status?: string | null;
  cleaner_id?: string | null;
  selected_cleaner_id?: string | null;
  location_id?: string | null;
  city_id?: string | null;
  location?: string | null;
  date?: string | null;
  time?: string | null;
};

type CleanerCandidate = {
  id: string;
  rating: number;
  activeBookings: number;
};

async function slotFree(
  admin: SupabaseClient,
  cleanerId: string,
  date: string | null,
  time: string | null,
  excludeBookingId: string,
): Promise<boolean> {
  if (!date || !time) {
    bookingAssignTrace({ step: "slotFree", cleanerId, date, time, excludeBookingId, free: true, reason: "missing_date_or_time" });
    return true;
  }
  const { data, error } = await admin
    .from("bookings")
    .select("id")
    .eq("cleaner_id", cleanerId)
    .eq("date", date)
    .eq("time", time)
    .in("status", SLOT_CONFLICT_STATUSES)
    .neq("id", excludeBookingId)
    .limit(1);
  const free = !error && !data?.length;
  bookingAssignTrace({
    step: "slotFree",
    cleanerId,
    date,
    time,
    excludeBookingId,
    free,
    supabaseError: error?.message ?? null,
    conflictCount: data?.length ?? 0,
  });
  if (error) return false;
  return free;
}

function cleanerLocationMatchesBooking(
  booking: BookingRowForAssignment,
  cleaner: { location_id?: string | null; city_id?: string | null },
): boolean {
  if (booking.location_id) return cleaner.location_id === booking.location_id;
  if (booking.city_id) return cleaner.city_id === booking.city_id;
  return true;
}

async function preferredCleanerEligible(
  admin: SupabaseClient,
  booking: BookingRowForAssignment,
  preferredId: string,
): Promise<boolean> {
  const { data: c, error } = await admin
    .from("cleaners")
    .select("id, is_active, is_available, location_id, city_id")
    .eq("id", preferredId)
    .maybeSingle();
  if (error || !c || typeof c !== "object") {
    bookingAssignTrace({
      step: "preferredCleanerEligible",
      bookingId: booking.id,
      preferredId,
      ok: false,
      reason: error?.message ? "cleaners_query_error" : "cleaner_not_found",
    });
    return false;
  }
  const row = c as {
    id: string;
    is_active?: boolean | null;
    is_available?: boolean | null;
    location_id?: string | null;
    city_id?: string | null;
  };
  if (row.is_active === false || row.is_available === false) {
    bookingAssignTrace({
      step: "preferredCleanerEligible",
      bookingId: booking.id,
      preferredId,
      ok: false,
      reason: "inactive_or_unavailable",
      is_active: row.is_active ?? null,
      is_available: row.is_available ?? null,
    });
    return false;
  }
  if (!cleanerLocationMatchesBooking(booking, row)) {
    bookingAssignTrace({
      step: "preferredCleanerEligible",
      bookingId: booking.id,
      preferredId,
      ok: false,
      reason: "location_mismatch",
      booking_location_id: booking.location_id ?? null,
      booking_city_id: booking.city_id ?? null,
      cleaner_location_id: row.location_id ?? null,
      cleaner_city_id: row.city_id ?? null,
    });
    return false;
  }
  const slotOk = await slotFree(admin, preferredId, booking.date ?? null, booking.time ?? null, booking.id);
  bookingAssignTrace({
    step: "preferredCleanerEligible",
    bookingId: booking.id,
    preferredId,
    ok: slotOk,
    reason: slotOk ? "ok" : "slot_conflict",
  });
  return slotOk;
}

async function countActiveBookings(admin: SupabaseClient, cleanerIds: string[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const id of cleanerIds) map.set(id, 0);
  if (cleanerIds.length === 0) return map;
  const { data, error } = await admin
    .from("bookings")
    .select("cleaner_id")
    .in("cleaner_id", cleanerIds)
    .in("status", ["pending", "assigned", "confirmed", "in_progress"]);
  if (error || !Array.isArray(data)) return map;
  for (const row of data) {
    const cid = row && typeof row === "object" ? String((row as { cleaner_id?: string }).cleaner_id ?? "") : "";
    if (!cid) continue;
    map.set(cid, (map.get(cid) ?? 0) + 1);
  }
  return map;
}

async function loadAutoCandidates(admin: SupabaseClient, booking: BookingRowForAssignment): Promise<CleanerCandidate[]> {
  let q = admin.from("cleaners").select("id, rating, is_active, is_available, location_id, city_id").eq("is_active", true).eq("is_available", true);
  if (booking.location_id) {
    q = q.eq("location_id", booking.location_id);
  } else if (booking.city_id) {
    q = q.eq("city_id", booking.city_id);
  } else {
    bookingAssignTrace({
      step: "loadAutoCandidates",
      bookingId: booking.id,
      reason: "no_location_id_or_city_id",
      location_id: booking.location_id ?? null,
      city_id: booking.city_id ?? null,
      candidateCount: 0,
    });
    return [];
  }
  const { data, error } = await q;
  if (error || !Array.isArray(data)) {
    bookingAssignTrace({
      step: "loadAutoCandidates",
      bookingId: booking.id,
      reason: error ? "cleaners_query_error" : "no_rows",
      supabaseError: error?.message ?? null,
      candidateCount: 0,
    });
    return [];
  }
  const ids = data
    .map((r) => (r && typeof r === "object" ? String((r as { id?: string }).id ?? "") : ""))
    .filter((id) => UUID_RE.test(id));
  const counts = await countActiveBookings(admin, ids);
  const out: CleanerCandidate[] = [];
  for (const r of data) {
    if (!r || typeof r !== "object") continue;
    const id = String((r as { id: string }).id ?? "");
    if (!UUID_RE.test(id)) continue;
    const rating = Number((r as { rating?: unknown }).rating);
    out.push({
      id,
      rating: Number.isFinite(rating) ? rating : 0,
      activeBookings: counts.get(id) ?? 0,
    });
  }
  out.sort((a, b) => {
    if (a.activeBookings !== b.activeBookings) return a.activeBookings - b.activeBookings;
    return b.rating - a.rating;
  });
  const free: CleanerCandidate[] = [];
  for (const c of out) {
    if (await slotFree(admin, c.id, booking.date ?? null, booking.time ?? null, booking.id)) free.push(c);
  }
  bookingAssignTrace({
    step: "loadAutoCandidates",
    bookingId: booking.id,
    reason: "ok",
    rawCleanerCount: data.length,
    slotFreeCount: free.length,
    orderedIds: out.map((x) => x.id),
    freeIds: free.map((x) => x.id),
  });
  return free;
}

export type AssignmentFields = {
  cleaner_id: string | null;
  selected_cleaner_id: string | null;
  status: string;
  dispatch_status: string;
  assignment_type: string | null;
  assigned_at: string | null;
  cleaner_response_status: string;
  attempted_cleaner_id?: string | null;
  fallback_reason?: string | null;
};

export async function buildAssignmentFieldsForPaidBookingRow(
  admin: SupabaseClient,
  booking: BookingRowForAssignment,
): Promise<AssignmentFields> {
  const now = new Date().toISOString();
  const preferredRaw = booking.selected_cleaner_id != null ? String(booking.selected_cleaner_id).trim() : "";
  const preferred = UUID_RE.test(preferredRaw) ? preferredRaw : "";

  if (preferred) {
    const ok = await preferredCleanerEligible(admin, booking, preferred);
    bookingAssignTrace({ step: "buildAssignmentFields", bookingId: booking.id, branch: "preferred", preferred, preferredOk: ok });
    if (ok) {
      return {
        cleaner_id: preferred,
        selected_cleaner_id: preferred,
        status: "assigned",
        dispatch_status: "assigned",
        assignment_type: "user_selected",
        assigned_at: now,
        cleaner_response_status: CLEANER_RESPONSE.PENDING,
        attempted_cleaner_id: preferred,
      };
    }
  }

  const candidates = await loadAutoCandidates(admin, booking);
  const first = candidates[0];
  bookingAssignTrace({
    step: "buildAssignmentFields",
    bookingId: booking.id,
    branch: "auto",
    candidateTopId: first?.id ?? null,
    candidateCount: candidates.length,
  });
  if (first) {
    return {
      cleaner_id: first.id,
      selected_cleaner_id: null,
      status: "assigned",
      dispatch_status: "assigned",
      assignment_type: preferred ? "auto_fallback" : "auto_dispatch",
      assigned_at: now,
      cleaner_response_status: CLEANER_RESPONSE.PENDING,
      ...(preferred
        ? { attempted_cleaner_id: preferred, fallback_reason: FALLBACK_REASON_CLEANER_NOT_AVAILABLE }
        : {}),
    };
  }

  bookingAssignTrace({
    step: "buildAssignmentFields",
    bookingId: booking.id,
    branch: "unassigned",
    cleaner_id: null,
    hadPreferred: Boolean(preferred),
  });
  return {
    cleaner_id: null,
    selected_cleaner_id: null,
    status: "pending",
    dispatch_status: "unassigned",
    assignment_type: null,
    assigned_at: null,
    cleaner_response_status: CLEANER_RESPONSE.NONE,
  };
}

export async function assignCleaner(bookingId: string): Promise<AssignCleanerResult> {
  bookingAssignTrace({ step: "assignCleaner_start", bookingId });
  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, error: "Server unavailable." };
  if (!UUID_RE.test(bookingId)) return { ok: false, error: "Invalid booking id." };

  const { data: row, error } = await admin
    .from("bookings")
    .select("id, status, cleaner_id, selected_cleaner_id, location_id, city_id, location, date, time")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row || typeof row !== "object") {
    bookingAssignTrace({ step: "assignCleaner_load", bookingId, ok: false, reason: "not_found", supabaseError: error?.message });
    return { ok: true, mode: "skipped", reason: "not_found" };
  }

  const b = row as BookingRowForAssignment;
  const st = String(b.status ?? "").toLowerCase();
  bookingAssignTrace({
    step: "assignCleaner_booking_row",
    bookingId,
    status: st,
    cleaner_id: b.cleaner_id ?? null,
    selected_cleaner_id: b.selected_cleaner_id ?? null,
    location_id: b.location_id ?? null,
    city_id: b.city_id ?? null,
  });
  if (st !== "pending") {
    bookingAssignTrace({ step: "assignCleaner_skip", bookingId, reason: "not_applicable_status", status: st });
    return { ok: true, mode: "skipped", reason: "not_applicable_status" };
  }
  if (b.cleaner_id && String(b.cleaner_id).trim()) {
    bookingAssignTrace({ step: "assignCleaner_skip", bookingId, reason: "already_assigned", cleaner_id: b.cleaner_id });
    return { ok: true, mode: "skipped", reason: "already_assigned" };
  }

  const patch = await buildAssignmentFieldsForPaidBookingRow(admin, b);
  bookingAssignTrace({
    step: "assignCleaner_patch",
    bookingId,
    next_cleaner_id: patch.cleaner_id,
    next_status: patch.status,
    dispatch_status: patch.dispatch_status,
    assignment_type: patch.assignment_type,
  });
  const { error: upErr } = await admin
    .from("bookings")
    .update(patch)
    .eq("id", bookingId)
    .eq("status", "pending")
    .is("cleaner_id", null);

  if (upErr) {
    bookingAssignTrace({ step: "assignCleaner_update", bookingId, ok: false, error: upErr.message });
    return { ok: false, error: upErr.message };
  }
  bookingAssignTrace({
    step: "assignCleaner_update",
    bookingId,
    ok: true,
    note: "Update issued with .eq(status,pending).is(cleaner_id,null); if row had different state, Supabase may still return ok with zero rows affected.",
  });

  if (patch.cleaner_id) {
    try {
      await notifyCleanerAssignedBooking(admin, bookingId, patch.cleaner_id);
    } catch {
      /* notification best-effort */
    }
    return { ok: true, mode: "assigned", cleanerId: patch.cleaner_id };
  }
  return { ok: true, mode: "unassigned" };
}
