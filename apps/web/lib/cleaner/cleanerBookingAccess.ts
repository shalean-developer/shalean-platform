import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";

/**
 * Columns callers should include on `bookings` selects when using {@link cleanerJobsListRowPostFilter}
 * (otherwise `pending_payment` rows may be dropped if recurring signals are missing from the payload).
 */
export const CLEANER_JOBS_LIST_RECURRING_VISIBILITY_COLUMNS =
  "is_recurring_generated,billing_type,monthly_invoice_id";

/**
 * Dual-signal “assignment accepted” from a raw `bookings` row (canonical column + `accepted_at`).
 * Shared by operational state and cleaner mobile mapping to avoid forked interpretation.
 */
export function isCleanerAssignmentAcceptedRecord(row: Record<string, unknown>): boolean {
  const raw = row.cleaner_response_status;
  const r = raw == null || raw === "" ? "" : String(raw).trim().toLowerCase();
  const hasAcceptedAt = Boolean(String(row.accepted_at ?? "").trim());
  return r === CLEANER_RESPONSE.ACCEPTED || hasAcceptedAt;
}

/** True when an unpaid `pending_payment` row should be visible on cleaner job lists (recurring / invoice-backed only). */
export function bookingMatchesRecurringCleanerPendingPayment(row: Record<string, unknown>): boolean {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st !== "pending_payment") return false;
  if (row.is_recurring_generated === true) return true;
  const bt = String(row.billing_type ?? "").trim().toLowerCase();
  if (bt === "recurring_invoice" || bt === "monthly_contract") return true;
  const mid = row.monthly_invoice_id;
  if (mid != null && String(mid).trim() !== "") return true;
  return false;
}

/** Machine-readable reason for {@link bookingMatchesRecurringCleanerPendingPayment} (logging / support). */
export function recurringPendingPaymentVisibilityReason(row: Record<string, unknown>): string {
  if (row.is_recurring_generated === true) return "is_recurring_generated";
  const bt = String(row.billing_type ?? "").trim().toLowerCase();
  if (bt === "recurring_invoice" || bt === "monthly_contract") return "billing_type";
  const mid = row.monthly_invoice_id;
  if (mid != null && String(mid).trim() !== "") return "monthly_invoice_id";
  return "none";
}

/**
 * Cleaner jobs/dashboard list policy: hide terminal payment failures; hide one-time `pending_payment`;
 * allow recurring / invoice-backed `pending_payment` for assigned/roster/team rows (assignment enforced by queries).
 */
export function cleanerJobsListRowPostFilter(row: Record<string, unknown>): boolean {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st === "failed" || st === "payment_expired") return false;
  if (st === "pending_payment") return bookingMatchesRecurringCleanerPendingPayment(row);
  return true;
}

/** How the cleaner row entered the merged visibility set (diagnostics only). */
export function assignmentSourceForVisibilityLog(viewerId: string, row: Record<string, unknown>): string {
  const v = viewerId.trim();
  const cid = String(row.cleaner_id ?? "").trim();
  const owner = String(row.payout_owner_cleaner_id ?? "").trim();
  if (cid === v || owner === v) return "direct_or_owner";
  if (row.is_team_job === true && String(row.team_id ?? "").trim()) return "team_scope";
  return "roster_or_merged";
}

/** Customer-facing banner for cleaner apps when a recurring unpaid job is listed. */
export function cleanerPendingPaymentBannerForRow(row: Record<string, unknown>): string | null {
  const st = String(row.status ?? "").trim().toLowerCase();
  if (st !== "pending_payment" || !bookingMatchesRecurringCleanerPendingPayment(row)) return null;
  const bt = String(row.billing_type ?? "").trim().toLowerCase();
  if (bt === "monthly_contract" || bt === "recurring_invoice") return "Recurring invoice pending";
  const mid = row.monthly_invoice_id;
  if (mid != null && String(mid).trim() !== "") return "Recurring invoice pending";
  if (row.is_recurring_generated === true) return "Awaiting customer payment";
  return "Awaiting customer payment";
}

/** Stable schedule ordering after merging visibility branches in JS. */
export function sortBookingsByDateThenTime(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const da = String(a.date ?? "").slice(0, 10);
    const db = String(b.date ?? "").slice(0, 10);
    if (da !== db) return da.localeCompare(db);
    return String(a.time ?? "").localeCompare(String(b.time ?? ""));
  });
}

/** Completed-job ordering for earnings / reconcile merges. */
export function sortBookingsByCompletedAtThenId(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((a, b) => {
    const ca = String(a.completed_at ?? "");
    const cb = String(b.completed_at ?? "");
    const cmp = cb.localeCompare(ca);
    if (cmp !== 0) return cmp;
    return String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
}

/**
 * Loads bookings visible to a cleaner using **separate** queries per visibility rule, then merges.
 * Avoids PostgREST `.or(and(is_team_job…, team_id.in.(…)), …)` parsing quirks that can drop team rows.
 *
 * **List policy:** after merge, rows are filtered with {@link cleanerJobsListRowPostFilter} — include
 * {@link CLEANER_JOBS_LIST_RECURRING_VISIBILITY_COLUMNS} in `select` so recurring `pending_payment` jobs
 * are not dropped when they should remain visible.
 */
export async function fetchCleanerVisibleBookingsMerged(
  admin: SupabaseClient,
  cleanerId: string,
  params: {
    select: string;
    /** Applied to each branch builder before `.limit` (status excludes, orders, extra `.eq`, …). */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder chain
    applyEachBranch?: (q: any) => any;
    /** Soft cap per branch before dedupe (merged list may be shorter after dedupe). */
    perBranchLimit: number;
  },
): Promise<{ data: Record<string, unknown>[] | null; error: PostgrestError | null }> {
  const cid = cleanerId.trim();
  if (!cid) {
    return { data: [], error: null };
  }

  const [teamIds, rosterBookingIds] = await Promise.all([
    fetchCleanerTeamIds(admin, cid),
    fetchBookingIdsWhereCleanerOnRoster(admin, cid),
  ]);

  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safeRoster = rosterBookingIds.filter((id) => uuidRe.test(id));

  const dedupe = new Map<string, Record<string, unknown>>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const apply = params.applyEachBranch ?? ((q: any) => q);
  const lim = Math.max(1, params.perBranchLimit);

  const consume = (rows: Record<string, unknown>[] | null) => {
    for (const row of rows ?? []) {
      const id = String(row.id ?? "").trim();
      if (id) dedupe.set(id, row);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const exec = async (seed: any): Promise<PostgrestError | null> => {
    const q = apply(seed).limit(lim);
    const { data, error } = await q;
    if (error) return error;
    consume(data as Record<string, unknown>[]);
    return null;
  };

  let err = await exec(admin.from("bookings").select(params.select).or(`cleaner_id.eq.${cid},payout_owner_cleaner_id.eq.${cid}`));
  if (err) return { data: null, error: err };

  if (teamIds.length > 0) {
    err = await exec(admin.from("bookings").select(params.select).eq("is_team_job", true).in("team_id", teamIds));
    if (err) return { data: null, error: err };
  }

  if (safeRoster.length > 0) {
    err = await exec(admin.from("bookings").select(params.select).in("id", safeRoster));
    if (err) return { data: null, error: err };
  }

  const merged = [...dedupe.values()].filter(cleanerJobsListRowPostFilter);
  return { data: merged, error: null };
}

export type BookingAccessRow = {
  /** Booking id — enables roster membership checks via `booking_cleaners`. */
  id?: string | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
};

/** Distinct team IDs this cleaner belongs to (active membership rows). */
export async function fetchCleanerTeamIds(admin: SupabaseClient, cleanerId: string): Promise<string[]> {
  const { data, error } = await admin
    .from("team_members")
    .select("team_id")
    .eq("cleaner_id", cleanerId)
    .not("team_id", "is", null);
  if (error || !data?.length) return [];
  const ids = new Set<string>();
  for (const raw of data) {
    const tid = String((raw as { team_id?: string | null }).team_id ?? "").trim();
    if (tid) ids.add(tid);
  }
  return [...ids];
}

/**
 * PostgREST `.or()` expression for bookings the cleaner may see:
 * assigned solo cleaner, payroll owner (team / admin paths), OR team job on a team they belong to.
 */
/**
 * Booking ids where the cleaner appears on `booking_cleaners` (for PostgREST `.or()` visibility).
 */
export async function fetchBookingIdsWhereCleanerOnRoster(
  admin: SupabaseClient,
  cleanerId: string,
  limit = 500,
): Promise<string[]> {
  const { data, error } = await admin
    .from("booking_cleaners")
    .select("booking_id")
    .eq("cleaner_id", cleanerId)
    .order("assigned_at", { ascending: false })
    .limit(limit);
  if (error || !data?.length) return [];
  const out = new Set<string>();
  for (const raw of data) {
    const id = String((raw as { booking_id?: string | null }).booking_id ?? "").trim();
    if (id) out.add(id);
  }
  return [...out];
}

/** Append `id.in.(...)` for roster-only bookings to a PostgREST `.or()` filter string. */
export function appendRosterBookingIdsToOrFilter(baseOr: string, bookingIds: readonly string[]): string {
  const ids = [...new Set(bookingIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  if (!ids.length) return baseOr;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const safe = ids.filter((id) => uuidRe.test(id));
  if (!safe.length) return baseOr;
  return `${baseOr},id.in.(${safe.join(",")})`;
}

export function bookingsVisibilityOrFilter(cleanerId: string, teamIds: string[]): string {
  const c = cleanerId.trim();
  if (!c) return `cleaner_id.eq.${c}`;
  const soloOrOwner = `cleaner_id.eq.${c},payout_owner_cleaner_id.eq.${c}`;
  const list = teamIds.map((t) => t.trim()).filter(Boolean);
  if (!list.length) return soloOrOwner;
  return `${soloOrOwner},and(is_team_job.eq.true,team_id.in.(${list.join(",")}))`;
}

/**
 * PostgREST `.or(...)` filter for every booking a cleaner may see (solo, payout owner, team, roster).
 * Use from `/api/cleaner/jobs`, `/api/cleaner/dashboard`, and anywhere else visibility must stay aligned.
 */
export async function getCleanerVisibleBookingsOrFilter(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<{ orFilter: string }> {
  const teamIds = await fetchCleanerTeamIds(admin, cleanerId);
  const rosterBookingIds = await fetchBookingIdsWhereCleanerOnRoster(admin, cleanerId);
  const orFilter = appendRosterBookingIdsToOrFilter(bookingsVisibilityOrFilter(cleanerId, teamIds), rosterBookingIds);
  return { orFilter };
}

export async function cleanerHasBookingAccess(
  admin: SupabaseClient,
  cleanerId: string,
  row: BookingAccessRow,
): Promise<boolean> {
  if (String(row.cleaner_id ?? "").trim() === cleanerId.trim()) return true;
  if (String(row.payout_owner_cleaner_id ?? "").trim() === cleanerId.trim()) return true;
  const bid = String(row.id ?? "").trim();
  if (bid) {
    const { data: rosterHit, error: rosterErr } = await admin
      .from("booking_cleaners")
      .select("id")
      .eq("booking_id", bid)
      .eq("cleaner_id", cleanerId)
      .maybeSingle();
    if (!rosterErr && rosterHit) return true;
  }
  if (row.is_team_job !== true) return false;
  const teamId = String(row.team_id ?? "").trim();
  if (!teamId) return false;
  const { data, error } = await admin
    .from("team_members")
    .select("team_id")
    .eq("team_id", teamId)
    .eq("cleaner_id", cleanerId)
    .maybeSingle();
  return !error && data != null;
}
