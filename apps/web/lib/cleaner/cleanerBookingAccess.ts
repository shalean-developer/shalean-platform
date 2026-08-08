import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { CLEANER_RESPONSE } from "@/lib/dispatch/cleanerResponseStatus";
import { isTeamMemberActiveOnBookingDate } from "@/lib/cleaner/teamMemberAvailability";

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

type CleanerTeamMembershipRow = {
  team_id?: string | null;
  cleaner_id?: string | null;
  active_from?: string | null;
  active_to?: string | null;
};

/**
 * Team-scope visibility must match the cleaner's membership on the booking date.
 * A historical/future membership on the same team is not enough by itself.
 */
export function cleanerTeamMembershipMatchesBookingDate(
  booking: { team_id?: unknown; date?: unknown },
  memberships: readonly CleanerTeamMembershipRow[],
): boolean {
  const teamId = String(booking.team_id ?? "").trim();
  const dateYmd = String(booking.date ?? "").trim().slice(0, 10);
  if (!teamId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return false;
  return memberships.some(
    (membership) =>
      String(membership.team_id ?? "").trim() === teamId &&
      isTeamMemberActiveOnBookingDate(membership, dateYmd),
  );
}

export async function fetchCleanerTeamMemberships(
  admin: SupabaseClient,
  cleanerId: string,
): Promise<CleanerTeamMembershipRow[]> {
  const { data, error } = await admin
    .from("team_members")
    .select("team_id, cleaner_id, active_from, active_to")
    .eq("cleaner_id", cleanerId)
    .not("team_id", "is", null);
  if (error || !data?.length) return [];
  return data as CleanerTeamMembershipRow[];
}

/**
 * Loads bookings visible to a cleaner using separate queries per visibility rule, then merges.
 * Direct assignment and explicit `booking_cleaners` roster membership remain authoritative.
 * Team-scope visibility is additionally constrained to membership active on the booking date.
 */
export async function fetchCleanerVisibleBookingsMerged(
  admin: SupabaseClient,
  cleanerId: string,
  params: {
    select: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder chain
    applyEachBranch?: (q: any) => any;
    perBranchLimit: number;
  },
): Promise<{ data: Record<string, unknown>[] | null; error: PostgrestError | null }> {
  const cid = cleanerId.trim();
  if (!cid) return { data: [], error: null };

  const [teamMemberships, rosterBookingIds] = await Promise.all([
    fetchCleanerTeamMemberships(admin, cid),
    fetchBookingIdsWhereCleanerOnRoster(admin, cid),
  ]);
  const teamIds = [
    ...new Set(
      teamMemberships
        .map((membership) => String(membership.team_id ?? "").trim())
        .filter(Boolean),
    ),
  ];

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
    consume((data ?? []) as Record<string, unknown>[]);
    return null;
  };

  const execTeamDateAware = async (): Promise<PostgrestError | null> => {
    const pageSize = Math.min(1000, Math.max(lim, 100));
    let offset = 0;
    let accepted = 0;
    while (accepted < lim) {
      const seed = admin.from("bookings").select(params.select).eq("is_team_job", true).in("team_id", teamIds);
      const applied = apply(seed);
      const supportsRange = typeof applied?.range === "function";
      const q = supportsRange
        ? applied.range(offset, offset + pageSize - 1)
        : applied.limit(pageSize);
      const { data, error } = await q;
      if (error) return error;
      const rows = (data ?? []) as Record<string, unknown>[];
      const eligible = rows.filter((row) => cleanerTeamMembershipMatchesBookingDate(row, teamMemberships));
      const remaining = lim - accepted;
      const acceptedRows = eligible.slice(0, remaining);
      consume(acceptedRows);
      accepted += acceptedRows.length;
      if (!supportsRange || rows.length < pageSize) break;
      offset += pageSize;
    }
    return null;
  };

  let err = await exec(
    admin.from("bookings").select(params.select).or(`cleaner_id.eq.${cid},payout_owner_cleaner_id.eq.${cid}`),
  );
  if (err) return { data: null, error: err };

  if (teamIds.length > 0) {
    err = await execTeamDateAware();
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
  id?: string | null;
  date?: string | null;
  cleaner_id?: string | null;
  payout_owner_cleaner_id?: string | null;
  team_id?: string | null;
  is_team_job?: boolean | null;
};

/**
 * Earnings attribution is stricter than job visibility: a current team membership must not award
 * earnings for a completed booking unless the cleaner was explicitly assigned to that booking.
 */
export function isExplicitCleanerBookingAttribution(
  row: BookingAccessRow,
  cleanerId: string,
  rosterBookingIds: ReadonlySet<string>,
): boolean {
  const cid = cleanerId.trim();
  const bookingId = String(row.id ?? "").trim();
  return (
    (bookingId !== "" && rosterBookingIds.has(bookingId)) ||
    String(row.cleaner_id ?? "").trim() === cid ||
    String(row.payout_owner_cleaner_id ?? "").trim() === cid
  );
}

/** Distinct team IDs represented in this cleaner's membership history. */
export async function fetchCleanerTeamIds(admin: SupabaseClient, cleanerId: string): Promise<string[]> {
  const memberships = await fetchCleanerTeamMemberships(admin, cleanerId);
  return [
    ...new Set(
      memberships
        .map((membership) => String(membership.team_id ?? "").trim())
        .filter(Boolean),
    ),
  ];
}

/** Booking ids where the cleaner appears explicitly on `booking_cleaners`. */
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
 * Compatibility filter for callers that cannot use the merged loader yet.
 * Team membership in this string is not date-aware, so new cleaner job/dashboard reads should use
 * {@link fetchCleanerVisibleBookingsMerged}; explicit access checks below are date-aware.
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
  const cid = cleanerId.trim();
  if (String(row.cleaner_id ?? "").trim() === cid) return true;
  if (String(row.payout_owner_cleaner_id ?? "").trim() === cid) return true;

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

  let isTeamJob = row.is_team_job === true;
  let teamId = String(row.team_id ?? "").trim();
  let dateYmd = String(row.date ?? "").trim().slice(0, 10);
  if (bid && (!isTeamJob || !teamId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd))) {
    const { data: bookingHead, error: bookingHeadError } = await admin
      .from("bookings")
      .select("date, team_id, is_team_job")
      .eq("id", bid)
      .maybeSingle();
    if (bookingHeadError || !bookingHead) return false;
    isTeamJob = bookingHead.is_team_job === true;
    teamId = String(bookingHead.team_id ?? "").trim();
    dateYmd = String(bookingHead.date ?? "").trim().slice(0, 10);
  }

  if (!isTeamJob || !teamId || !/^\d{4}-\d{2}-\d{2}$/.test(dateYmd)) return false;

  const { data, error } = await admin
    .from("team_members")
    .select("team_id, cleaner_id, active_from, active_to")
    .eq("team_id", teamId)
    .eq("cleaner_id", cleanerId);
  if (error || !data?.length) return false;
  return cleanerTeamMembershipMatchesBookingDate(
    { team_id: teamId, date: dateYmd },
    data as CleanerTeamMembershipRow[],
  );
}
