/**
 * Customer bookings API visibility: {@link explainCustomerDashboardVisibility} in `dashboardVisibilityContract.ts`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { customerCanAccessBookingRow } from "@/lib/customer/customerBookingOwnership";
import {
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

export type CustomerBookingsScope = "all" | "upcoming" | "past";

export type CustomerBookingsPagination = {
  scope: CustomerBookingsScope;
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
};

export type LoadCustomerBookingsOptions = {
  /** Authenticated email used only to repair legacy email-owned rows. */
  viewerEmail?: string | null;
  /** Omit for legacy unpaged callers. */
  scope?: CustomerBookingsScope;
  page?: number;
  pageSize?: number;
};

/** Legacy maximum retained for callers that have not moved to pagination yet. */
export const CUSTOMER_BOOKINGS_LIST_LIMIT = 500;
export const CUSTOMER_BOOKINGS_DEFAULT_PAGE_SIZE = 10;
export const CUSTOMER_BOOKINGS_MAX_PAGE_SIZE = 50;

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

function johannesburgToday(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Johannesburg",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value ?? "";
  const month = parts.find((p) => p.type === "month")?.value ?? "";
  const day = parts.find((p) => p.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function normalizePage(value: unknown): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

function normalizePageSize(value: unknown): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return CUSTOMER_BOOKINGS_DEFAULT_PAGE_SIZE;
  return Math.min(n, CUSTOMER_BOOKINGS_MAX_PAGE_SIZE);
}

/**
 * Permanently converges old booking ownership onto `customer_id` once the
 * authenticated user proves either the legacy `user_id` or exact auth email.
 * This keeps recovery support without carrying legacy ownership indefinitely.
 */
async function repairLegacyCustomerOwnership(
  admin: SupabaseClient,
  userId: string,
  viewerNorm: string,
  ownershipColumn: BookingCustomerOwnershipColumn,
): Promise<void> {
  if (ownershipColumn !== "customer_id") return;

  const legacyUserUpdate = await admin
    .from("bookings")
    .update({ customer_id: userId })
    .is("customer_id", null)
    .eq("user_id", userId)
    .select("id");

  if (legacyUserUpdate.error && !isUnknownColumnError(legacyUserUpdate.error, "user_id")) {
    void reportOperationalIssue("warn", "customer/bookings/ownership_repair_user_id", legacyUserUpdate.error.message, {
      userId,
    });
  } else if (legacyUserUpdate.data?.length) {
    metrics.increment("customer.bookings.ownership_repaired_user_id", { count: legacyUserUpdate.data.length });
  }

  if (viewerNorm.length < 3) return;

  const emailUpdate = await admin
    .from("bookings")
    .update({ customer_id: userId })
    .is("customer_id", null)
    .eq("customer_email", viewerNorm)
    .select("id");

  if (emailUpdate.error) {
    void reportOperationalIssue("warn", "customer/bookings/ownership_repair_email", emailUpdate.error.message, { userId });
  } else if (emailUpdate.data?.length) {
    metrics.increment("customer.bookings.ownership_repaired_email", { count: emailUpdate.data.length });
  }
}

async function loadOwnedCustomerBookingRows(
  admin: SupabaseClient,
  userId: string,
  ownershipColumn: BookingCustomerOwnershipColumn,
  options?: LoadCustomerBookingsOptions,
): Promise<{ data: unknown[] | null; error: { message: string } | null; count: number | null }> {
  const select = buildCustomerBookingSelect(ownershipColumn);
  const scope = options?.scope ?? "all";
  const paged = options?.scope !== undefined;
  const page = normalizePage(options?.page);
  const pageSize = normalizePageSize(options?.pageSize);
  const today = johannesburgToday();

  let query = admin
    .from("bookings")
    .select(select, { count: paged ? "exact" : undefined })
    .eq(ownershipColumn, userId)
    .neq("status", "payment_expired");

  if (scope === "upcoming") {
    query = query
      .gte("date", today)
      .not("status", "in", "(completed,cancelled,failed)")
      .order("date", { ascending: true })
      .order("time", { ascending: true })
      .order("created_at", { ascending: false });
  } else if (scope === "past") {
    query = query
      .or(`date.lt.${today},status.in.(completed,cancelled,failed)`)
      .order("date", { ascending: false, nullsFirst: false })
      .order("time", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query.order("created_at", { ascending: false });
  }

  if (paged) {
    const from = (page - 1) * pageSize;
    return query.range(from, from + pageSize - 1);
  }

  return query.limit(CUSTOMER_BOOKINGS_LIST_LIMIT);
}

async function enrichRowsWithSavedAddresses(
  admin: SupabaseClient,
  rows: BookingRow[],
  userId: string,
): Promise<void> {
  const missing = rows.filter((row) => !row.location?.trim() && row.suburb?.trim());
  if (missing.length === 0) return;

  const suburbs = Array.from(new Set(missing.map((row) => row.suburb!.trim()).filter(Boolean)));
  if (suburbs.length === 0) return;

  const { data, error } = await admin
    .from("customer_saved_addresses")
    .select("line1, suburb, city, created_at")
    .eq("user_id", userId)
    .in("suburb", suburbs)
    .order("created_at", { ascending: false })
    .limit(Math.min(Math.max(suburbs.length * 10, 20), 200));

  if (error || !data?.length) {
    if (error) {
      void reportOperationalIssue("warn", "customer/bookings/address_enrichment", error.message, {
        userId,
        bookingCount: missing.length,
      });
    }
    return;
  }

  const bySuburb = new Map<string, Array<{ line1?: unknown; suburb?: unknown; created_at?: unknown }>>();
  for (const raw of data as Array<{ line1?: unknown; suburb?: unknown; created_at?: unknown }>) {
    const suburb = typeof raw.suburb === "string" ? raw.suburb.trim() : "";
    if (!suburb) continue;
    const list = bySuburb.get(suburb) ?? [];
    list.push(raw);
    bySuburb.set(suburb, list);
  }

  for (const row of missing) {
    const suburb = row.suburb?.trim() ?? "";
    const candidates = bySuburb.get(suburb) ?? [];
    if (candidates.length === 0) continue;
    const bookingCreatedMs = Date.parse(row.created_at);
    const picked =
      candidates.find((addr) => {
        const createdMs = Date.parse(String(addr.created_at ?? ""));
        return Number.isFinite(bookingCreatedMs) && Number.isFinite(createdMs) && Math.abs(createdMs - bookingCreatedMs) < 5 * 60 * 1000;
      }) ?? candidates[0];
    const line1 = typeof picked?.line1 === "string" ? picked.line1.trim() : "";
    if (line1) row.location = line1;
  }
}

export async function loadCustomerBookingRowsForUser(
  admin: SupabaseClient,
  userId: string,
  options?: LoadCustomerBookingsOptions,
): Promise<
  | { ok: true; bookings: BookingRow[]; pagination?: CustomerBookingsPagination }
  | { ok: false; error: string; status: number }
> {
  const viewerNorm = normalizeEmail(String(options?.viewerEmail ?? ""));
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);

  await repairLegacyCustomerOwnership(admin, userId, viewerNorm, ownershipColumn);

  const { data, error, count } = await loadOwnedCustomerBookingRows(admin, userId, ownershipColumn, options);

  if (error) {
    void reportOperationalIssue("error", "customer/bookings", error.message, { userId, ownershipColumn });
    return { ok: false, error: "Could not load bookings.", status: 500 };
  }

  const rows = ((data ?? []) as unknown as BookingRow[])
    .map((row) => normalizeBookingCustomerIdentity(row))
    .map((row) => normalizeCustomerBookingRow(row))
    .filter((row) => customerCanAccessBookingRow(row, userId, viewerNorm))
    .map((row) => attachCanonicalCustomerBookingLifecycle(row));

  await enrichRowsWithCleanerDisplayNames(admin, rows, userId);
  await enrichRowsWithSavedAddresses(admin, rows, userId);

  if (options?.scope !== undefined) {
    const page = normalizePage(options.page);
    const pageSize = normalizePageSize(options.pageSize);
    const total = Math.max(0, count ?? rows.length);
    return {
      ok: true,
      bookings: rows,
      pagination: {
        scope: options.scope,
        page,
        pageSize,
        total,
        pageCount: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
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
  await repairLegacyCustomerOwnership(admin, userId, viewerNorm, ownershipColumn);

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
  if (st === "payment_expired") {
    return { ok: false, error: "Not found.", status: 404 };
  }
  if (!customerCanAccessBookingRow(row, userId, viewerNorm)) {
    return { ok: false, error: "Not found.", status: 404 };
  }
  const enriched = attachCanonicalCustomerBookingLifecycle(row);
  await enrichRowsWithCleanerDisplayNames(admin, [enriched], userId);
  await enrichRowsWithSavedAddresses(admin, [enriched], userId);
  return { ok: true, booking: enriched };
}
