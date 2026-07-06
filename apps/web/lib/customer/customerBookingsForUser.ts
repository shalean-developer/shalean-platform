/**
 * Customer bookings API visibility: {@link explainCustomerDashboardVisibility} in `dashboardVisibilityContract.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import {
  customerCanAccessBookingRow,
  mergeCustomerBookingListsByCreatedAtDesc,
} from "@/lib/customer/customerBookingOwnership";
import {
  bookingCustomerKey,
  normalizeBookingCustomerIdentity,
  type BookingCustomerOwnershipColumn,
} from "@/lib/booking/bookingCustomerIdentity";
import { isUnknownColumnError } from "@/lib/cleaner/cleanerMeDb";
import { attachCanonicalCustomerBookingLifecycle } from "@/lib/customer/attachCanonicalCustomerBookingLifecycle";
import { buildCustomerBookingSelect } from "@/lib/dashboard/customerBookingSelect";
import type { BookingRow } from "@/lib/dashboard/types";
import { normalizeCustomerBookingRow } from "@/lib/dashboard/normalizeCustomerBookingRow";
import { metrics } from "@/lib/metrics/counters";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import {
  applyTeamLeadCleanerNamesToRows,
  extractTeamLeadCleanerIdsForEnrichment,
} from "@/lib/reviews/teamLeadCleanerNameEnrichment";
import {
  applyCustomerDisplayCleanerNamesToRows,
  applyPairedRosterDisplayCleanerNames,
  extractCustomerDisplayCleanerIds,
} from "@/lib/customer/customerCleanerNameEnrichment";
import { fetchTeamRosterByBookingIds } from "@/lib/cleaner/fetchTeamRosterByBookingIds";

async function enrichCustomerBookingRowFromSavedAddress(
  admin: SupabaseClient,
  row: BookingRow,
): Promise<BookingRow> {
  const ownerId = bookingCustomerKey(row);
  if (row.location?.trim() || !ownerId) return row;
  const suburb = row.suburb?.trim();
  if (!suburb) return row;

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .select("line1, suburb, city, created_at")
    .eq("user_id", ownerId)
    .eq("suburb", suburb)
    .order("created_at", { ascending: false })
    .limit(3);

  if (error || !data?.length) return row;

  const bookingCreatedMs = Date.parse(row.created_at);
  const picked =
    data.find((addr) => {
      const createdMs = Date.parse(String((addr as { created_at?: string }).created_at ?? ""));
      return Number.isFinite(bookingCreatedMs) && Number.isFinite(createdMs) && Math.abs(createdMs - bookingCreatedMs) < 5 * 60 * 1000;
    }) ?? data[0];

  const line1 = typeof (picked as { line1?: unknown }).line1 === "string" ? (picked as { line1: string }).line1.trim() : "";
  if (!line1) return row;
  return { ...row, location: line1 };
}

export type LoadCustomerBookingsOptions = {
  /** When set, also returns paid bookings with no ownership id but matching `customer_email` (orphan repair). */
  viewerEmail?: string | null;
};

/** Max rows returned to customer dashboard / account booking lists. */
export const CUSTOMER_BOOKINGS_LIST_LIMIT = 500;

let cachedBookingOwnershipColumn: BookingCustomerOwnershipColumn | null = null;

export function resetBookingOwnershipColumnCacheForTests(): void {
  cachedBookingOwnershipColumn = null;
}

/** Used when a live query proves the cached ownership column is wrong. */
export function rememberBookingOwnershipColumn(column: BookingCustomerOwnershipColumn): void {
  cachedBookingOwnershipColumn = column;
}

export async function resolveBookingOwnershipColumn(admin: SupabaseClient): Promise<BookingCustomerOwnershipColumn> {
  if (cachedBookingOwnershipColumn) return cachedBookingOwnershipColumn;

  const customerProbe = await admin.from("bookings").select("customer_id").limit(1);
  if (!customerProbe.error) {
    cachedBookingOwnershipColumn = "customer_id";
    return cachedBookingOwnershipColumn;
  }
  if (isUnknownColumnError(customerProbe.error, "customer_id")) {
    const userProbe = await admin.from("bookings").select("user_id").limit(1);
    if (!userProbe.error) {
      cachedBookingOwnershipColumn = "user_id";
      return cachedBookingOwnershipColumn;
    }
  }
  cachedBookingOwnershipColumn = "customer_id";
  return cachedBookingOwnershipColumn;
}

async function loadOwnedCustomerBookingRows(
  admin: SupabaseClient,
  userId: string,
  ownershipColumn: BookingCustomerOwnershipColumn,
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const select = buildCustomerBookingSelect(ownershipColumn);
  return admin
    .from("bookings")
    .select(select)
    .eq(ownershipColumn, userId)
    .neq("status", "pending_payment")
    .neq("status", "payment_expired")
    .order("created_at", { ascending: false })
    .limit(CUSTOMER_BOOKINGS_LIST_LIMIT);
}

async function loadOrphanCustomerBookingRows(
  admin: SupabaseClient,
  viewerNorm: string,
  ownershipColumn: BookingCustomerOwnershipColumn,
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const select = buildCustomerBookingSelect(ownershipColumn);
  return admin
    .from("bookings")
    .select(select)
    .eq("customer_email", viewerNorm)
    .is(ownershipColumn, null)
    .neq("status", "pending_payment")
    .neq("status", "payment_expired")
    .order("created_at", { ascending: false })
    .limit(100);
}

export async function loadCustomerBookingRowsForUser(
  admin: SupabaseClient,
  userId: string,
  options?: LoadCustomerBookingsOptions,
): Promise<{ ok: true; bookings: BookingRow[] } | { ok: false; error: string; status: number }> {
  const viewerNorm = normalizeEmail(String(options?.viewerEmail ?? ""));
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);

  const { data: byUserId, error } = await loadOwnedCustomerBookingRows(admin, userId, ownershipColumn);

  if (error) {
    void reportOperationalIssue("error", "customer/bookings", error.message, { userId, ownershipColumn });
    return { ok: false, error: "Could not load bookings.", status: 500 };
  }

  let mergedRaw = ((byUserId ?? []) as unknown as BookingRow[]).map((row) =>
    normalizeBookingCustomerIdentity(row),
  );

  if (viewerNorm.length >= 3) {
    const { data: byEmailOrphan, error: orphanErr } = await loadOrphanCustomerBookingRows(
      admin,
      viewerNorm,
      ownershipColumn,
    );

    if (orphanErr) {
      void reportOperationalIssue("warn", "customer/bookings/email_orphan", orphanErr.message, { userId });
    } else if (byEmailOrphan && byEmailOrphan.length > 0) {
      metrics.increment("customer.bookings.email_orphan_merge_rows", { count: byEmailOrphan.length });
      mergedRaw = mergeCustomerBookingListsByCreatedAtDesc(
        mergedRaw as unknown as Array<{ id: string; created_at?: string | null }>,
        (byEmailOrphan as unknown as BookingRow[]).map((row) => normalizeBookingCustomerIdentity(row)) as unknown as Array<{
          id: string;
          created_at?: string | null;
        }>,
      ) as unknown as BookingRow[];
    }
  }

  const rows = mergedRaw
    .map((r) => normalizeCustomerBookingRow(r))
    .filter((r) => customerCanAccessBookingRow(r, userId, viewerNorm))
    .slice(0, CUSTOMER_BOOKINGS_LIST_LIMIT)
    .map((r) => attachCanonicalCustomerBookingLifecycle(r));

  // M-15: enrich team-job rows (cleaner_id null, payout_owner_cleaner_id set)
  // with the lead cleaner's display name so the dashboard reviews modal/list
  // can show "Reviewing X's clean". Roster-safe: the IN(...) lookup only
  // contains lead UUIDs already on the row payload — never `team_members`.
  // Skipped entirely for solo-cleaner pages (no extra round-trip).
  await enrichRowsWithCleanerDisplayNames(admin, rows, userId);

  for (let i = 0; i < rows.length; i += 1) {
    rows[i] = await enrichCustomerBookingRowFromSavedAddress(admin, rows[i]!);
  }

  return { ok: true, bookings: rows };
}

async function enrichRowsWithCleanerDisplayNames(
  admin: SupabaseClient,
  rows: BookingRow[],
  userId: string,
): Promise<void> {
  const teamLeadIds = extractTeamLeadCleanerIdsForEnrichment(rows);
  const displayIds = extractCustomerDisplayCleanerIds(rows);
  const allIds = Array.from(new Set([...teamLeadIds, ...displayIds]));
  if (allIds.length === 0) return;
  try {
    const { data, error } = await admin.from("cleaners").select("id, full_name").in("id", allIds);
    if (error) {
      void reportOperationalIssue("warn", "customer/bookings/cleaner_name_enrichment", error.message, {
        userId,
        cleanerIds: allIds.length,
      });
      return;
    }
    const nameById = new Map<string, string>();
    for (const r of (data ?? []) as Array<{ id: string; full_name: string | null }>) {
      const n = (r.full_name ?? "").trim();
      if (n) nameById.set(String(r.id), n);
    }
    applyTeamLeadCleanerNamesToRows(rows, nameById);
    applyCustomerDisplayCleanerNamesToRows(rows, nameById);

    const pairedBookingIds = rows
      .filter((row) => (Number(row.cleaner_count ?? 1) || 1) >= 2)
      .map((row) => String(row.id ?? "").trim())
      .filter(Boolean);
    if (pairedBookingIds.length > 0) {
      const rosterByBookingId = await fetchTeamRosterByBookingIds(admin, pairedBookingIds);
      applyPairedRosterDisplayCleanerNames(rows, rosterByBookingId);
    }
  } catch (e) {
    void reportOperationalIssue(
      "warn",
      "customer/bookings/cleaner_name_enrichment",
      e instanceof Error ? e.message : String(e),
      { userId, cleanerIds: allIds.length },
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

  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const select = buildCustomerBookingSelect(ownershipColumn);
  const { data, error } = await admin.from("bookings").select(select).eq("id", id).maybeSingle();

  if (error) {
    void reportOperationalIssue("error", "customer/bookings/detail", error.message, { userId, bookingId: id });
    return { ok: false, error: "Could not load booking.", status: 500 };
  }
  if (!data) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  const row = normalizeCustomerBookingRow(normalizeBookingCustomerIdentity(data as unknown as BookingRow));
  const st = String(row.status ?? "").toLowerCase();
  if (st === "pending_payment" || st === "payment_expired") {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (!customerCanAccessBookingRow(row, userId, viewerNorm)) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  const enriched = attachCanonicalCustomerBookingLifecycle(row);
  await enrichRowsWithCleanerDisplayNames(admin, [enriched], userId);
  const withAddress = await enrichCustomerBookingRowFromSavedAddress(admin, enriched);
  return { ok: true, booking: withAddress };
}
