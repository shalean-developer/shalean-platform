/**
 * Customer bookings API visibility: {@link explainCustomerDashboardVisibility} in `dashboardVisibilityContract.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import {
  customerCanAccessBookingRow,
  mergeCustomerBookingListsByCreatedAtDesc,
} from "@/lib/customer/customerBookingOwnership";
import { attachCanonicalCustomerBookingLifecycle } from "@/lib/customer/attachCanonicalCustomerBookingLifecycle";
import { CUSTOMER_BOOKING_SELECT } from "@/lib/dashboard/customerBookingSelect";
import type { BookingRow } from "@/lib/dashboard/types";
import { normalizeCustomerBookingRow } from "@/lib/dashboard/normalizeCustomerBookingRow";
import { metrics } from "@/lib/metrics/counters";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  applyTeamLeadCleanerNamesToRows,
  extractTeamLeadCleanerIdsForEnrichment,
} from "@/lib/reviews/teamLeadCleanerNameEnrichment";

export type LoadCustomerBookingsOptions = {
  /** When set, also returns paid bookings with `user_id` null but matching `customer_email` (orphan repair). */
  viewerEmail?: string | null;
};

export async function loadCustomerBookingRowsForUser(
  admin: SupabaseClient,
  userId: string,
  options?: LoadCustomerBookingsOptions,
): Promise<{ ok: true; bookings: BookingRow[] } | { ok: false; error: string; status: number }> {
  const viewerNorm = normalizeEmail(String(options?.viewerEmail ?? ""));

  const { data: byUserId, error } = await admin
    .from("bookings")
    .select(CUSTOMER_BOOKING_SELECT)
    .eq("user_id", userId)
    .neq("status", "pending_payment")
    .neq("status", "payment_expired")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    void reportOperationalIssue("error", "customer/bookings", error.message, { userId });
    return { ok: false, error: "Could not load bookings.", status: 500 };
  }

  let mergedRaw = (byUserId ?? []) as unknown as BookingRow[];

  if (viewerNorm.length >= 3) {
    const { data: byEmailOrphan, error: orphanErr } = await admin
      .from("bookings")
      .select(CUSTOMER_BOOKING_SELECT)
      .eq("customer_email", viewerNorm)
      .is("user_id", null)
      .neq("status", "pending_payment")
      .neq("status", "payment_expired")
      .order("created_at", { ascending: false })
      .limit(50);

    if (orphanErr) {
      void reportOperationalIssue("warn", "customer/bookings/email_orphan", orphanErr.message, { userId });
    } else if (byEmailOrphan && byEmailOrphan.length > 0) {
      metrics.increment("customer.bookings.email_orphan_merge_rows", { count: byEmailOrphan.length });
      mergedRaw = mergeCustomerBookingListsByCreatedAtDesc(
        mergedRaw as unknown as Array<{ id: string; created_at?: string | null }>,
        byEmailOrphan as unknown as Array<{ id: string; created_at?: string | null }>,
      ) as unknown as BookingRow[];
    }
  }

  const rows = mergedRaw
    .map((r) => normalizeCustomerBookingRow(r))
    .filter((r) => customerCanAccessBookingRow(r, userId, viewerNorm))
    .slice(0, 100)
    .map((r) => attachCanonicalCustomerBookingLifecycle(r));

  // M-15: enrich team-job rows (cleaner_id null, payout_owner_cleaner_id set)
  // with the lead cleaner's display name so the dashboard reviews modal/list
  // can show "Reviewing X's clean". Roster-safe: the IN(...) lookup only
  // contains lead UUIDs already on the row payload — never `team_members`.
  // Skipped entirely for solo-cleaner pages (no extra round-trip).
  await enrichRowsWithTeamLeadCleanerNames(admin, rows, userId);

  return { ok: true, bookings: rows };
}

async function enrichRowsWithTeamLeadCleanerNames(
  admin: SupabaseClient,
  rows: BookingRow[],
  userId: string,
): Promise<void> {
  const leadIds = extractTeamLeadCleanerIdsForEnrichment(rows);
  if (leadIds.length === 0) return;
  try {
    const { data, error } = await admin
      .from("cleaners")
      .select("id, full_name")
      .in("id", leadIds);
    if (error) {
      // Non-fatal: missing names just fall back to the existing snapshot/null
      // path in `cleanerFromRow` — the customer dashboard never blanks on
      // this enrichment (it is purely additive UX).
      void reportOperationalIssue(
        "warn",
        "customer/bookings/team_lead_name_enrichment",
        error.message,
        { userId, leadIds: leadIds.length },
      );
      return;
    }
    const nameById = new Map<string, string>();
    for (const r of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
      const n = (r.full_name ?? "").trim();
      if (n) nameById.set(String(r.id), n);
    }
    applyTeamLeadCleanerNamesToRows(rows, nameById);
  } catch (e) {
    void reportOperationalIssue(
      "warn",
      "customer/bookings/team_lead_name_enrichment",
      e instanceof Error ? e.message : String(e),
      { userId, leadIds: leadIds.length },
    );
  }
}

export async function loadCustomerBookingRowForUser(
  admin: SupabaseClient,
  userId: string,
  bookingId: string,
  options?: LoadCustomerBookingsOptions,
): Promise<{ ok: true; booking: BookingRow } | { ok: false; error: string; status: number }> {
  const id = bookingId.trim();
  if (!id) {
    return { ok: false, error: "Missing booking id.", status: 400 };
  }
  const viewerNorm = normalizeEmail(String(options?.viewerEmail ?? ""));

  const { data, error } = await admin.from("bookings").select(CUSTOMER_BOOKING_SELECT).eq("id", id).maybeSingle();

  if (error) {
    void reportOperationalIssue("error", "customer/bookings/detail", error.message, { userId, bookingId: id });
    return { ok: false, error: "Could not load booking.", status: 500 };
  }
  if (!data) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  const row = normalizeCustomerBookingRow(data as unknown as BookingRow);
  const st = String(row.status ?? "").toLowerCase();
  if (st === "pending_payment" || st === "payment_expired") {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (!customerCanAccessBookingRow(row, userId, viewerNorm)) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  return { ok: true, booking: attachCanonicalCustomerBookingLifecycle(row) };
}
