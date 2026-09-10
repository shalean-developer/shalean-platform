import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeEmail } from "@/lib/booking/normalizeEmail";
import { normalizeBookingCustomerIdentity } from "@/lib/booking/bookingCustomerIdentity";
import { customerCanAccessBookingRow } from "@/lib/customer/customerBookingOwnership";
import {
  enrichCustomerBookingRowsFromSavedAddresses,
  enrichRowsWithCleanerDisplayNames,
  resolveBookingOwnershipColumn,
} from "@/lib/customer/customerBookingsForUser";
import { attachCanonicalCustomerBookingLifecycle } from "@/lib/customer/attachCanonicalCustomerBookingLifecycle";
import { buildCustomerBookingSelect } from "@/lib/dashboard/customerBookingSelect";
import { normalizeCustomerBookingRow } from "@/lib/dashboard/normalizeCustomerBookingRow";
import type { BookingRow } from "@/lib/dashboard/types";
import { reportOperationalIssue } from "@/lib/logging/systemLog";
import { metrics } from "@/lib/metrics/counters";

export const CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT = 25;
export const CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT = 50;

type BookingCursor = { createdAt: string; id: string };

export type CustomerBookingPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
};

export type LoadCustomerBookingPageOptions = {
  viewerEmail?: string | null;
  cursor?: string | null;
  limit?: number;
};

function compareBookingRowsDesc(a: BookingRow, b: BookingRow): number {
  const at = Date.parse(String(a.created_at ?? ""));
  const bt = Date.parse(String(b.created_at ?? ""));
  const safeA = Number.isFinite(at) ? at : 0;
  const safeB = Number.isFinite(bt) ? bt : 0;
  if (safeA !== safeB) return safeB - safeA;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

export function normalizeCustomerBookingsPageLimit(input: number | undefined): number {
  if (!Number.isFinite(input)) return CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT;
  return Math.min(CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT, Math.max(1, Math.trunc(input!)));
}

export function encodeCustomerBookingsCursor(row: Pick<BookingRow, "id" | "created_at">): string {
  return Buffer.from(
    JSON.stringify({ createdAt: new Date(row.created_at).toISOString(), id: String(row.id) } satisfies BookingCursor),
    "utf8",
  ).toString("base64url");
}

export function decodeCustomerBookingsCursor(raw: string | null | undefined): BookingCursor | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<BookingCursor>;
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    const createdMs = Date.parse(typeof parsed.createdAt === "string" ? parsed.createdAt : "");
    if (!id || !Number.isFinite(createdMs)) return null;
    return { createdAt: new Date(createdMs).toISOString(), id };
  } catch {
    return null;
  }
}

function applyCursor<T>(query: T, cursor: BookingCursor | null): T {
  if (!cursor) return query;
  const withOr = query as T & { or: (filters: string) => T };
  return withOr.or(
    `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`,
  );
}

async function loadSourceRows(
  admin: SupabaseClient,
  args: {
    ownershipColumn: "customer_id" | "user_id";
    userId?: string;
    viewerNorm?: string;
    cursor: BookingCursor | null;
    fetchLimit: number;
  },
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const select = buildCustomerBookingSelect(args.ownershipColumn);
  let query = admin
    .from("bookings")
    .select(select)
    .neq("status", "payment_expired");

  if (args.userId) query = query.eq(args.ownershipColumn, args.userId);
  else query = query.eq("customer_email", args.viewerNorm!).is(args.ownershipColumn, null);

  query = applyCursor(query, args.cursor)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(args.fetchLimit);
  return query;
}

export async function loadCustomerBookingPageForUser(
  admin: SupabaseClient,
  userId: string,
  options?: LoadCustomerBookingPageOptions,
): Promise<
  | { ok: true; bookings: BookingRow[]; pageInfo: CustomerBookingPageInfo }
  | { ok: false; error: string; status: number }
> {
  const limit = normalizeCustomerBookingsPageLimit(options?.limit);
  const rawCursor = options?.cursor?.trim() ?? "";
  const cursor = rawCursor ? decodeCustomerBookingsCursor(rawCursor) : null;
  if (rawCursor && !cursor) return { ok: false, error: "Invalid bookings cursor.", status: 400 };

  const viewerNorm = normalizeEmail(String(options?.viewerEmail ?? ""));
  const ownershipColumn = await resolveBookingOwnershipColumn(admin);
  const fetchLimit = limit + 1;

  const owned = await loadSourceRows(admin, {
    ownershipColumn,
    userId,
    cursor,
    fetchLimit,
  });
  if (owned.error) {
    void reportOperationalIssue("error", "customer/bookings/page", owned.error.message, { userId, ownershipColumn });
    return { ok: false, error: "Could not load bookings.", status: 500 };
  }

  const rawRows = ((owned.data ?? []) as BookingRow[]).map((row) => normalizeBookingCustomerIdentity(row));
  if (viewerNorm.length >= 3) {
    const orphan = await loadSourceRows(admin, {
      ownershipColumn,
      viewerNorm,
      cursor,
      fetchLimit,
    });
    if (orphan.error) {
      void reportOperationalIssue("warn", "customer/bookings/page_email_orphan", orphan.error.message, { userId });
    } else if (orphan.data?.length) {
      metrics.increment("customer.bookings.email_orphan_merge_rows", { count: orphan.data.length });
      rawRows.push(...(orphan.data as BookingRow[]).map((row) => normalizeBookingCustomerIdentity(row)));
    }
  }

  const deduped = new Map<string, BookingRow>();
  for (const raw of rawRows) {
    const row = normalizeCustomerBookingRow(raw);
    if (!customerCanAccessBookingRow(row, userId, viewerNorm)) continue;
    if (!deduped.has(row.id)) deduped.set(row.id, row);
  }

  const ordered = Array.from(deduped.values()).sort(compareBookingRowsDesc);
  const hasMore = ordered.length > limit;
  const rows = ordered.slice(0, limit).map((row) => attachCanonicalCustomerBookingLifecycle(row));

  await enrichRowsWithCleanerDisplayNames(admin, rows, userId);
  await enrichCustomerBookingRowsFromSavedAddresses(admin, rows);

  const last = rows.at(-1);
  return {
    ok: true,
    bookings: rows,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeCustomerBookingsCursor(last) : null,
    },
  };
}
