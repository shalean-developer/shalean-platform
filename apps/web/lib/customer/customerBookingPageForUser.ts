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

type BookingCursor = {
  createdAt: string;
  id: string;
  ownedExhausted?: true;
  orphanExhausted?: true;
};

export type CustomerBookingPageInfo = {
  nextCursor: string | null;
  hasMore: boolean;
};

export type LoadCustomerBookingPageOptions = {
  viewerEmail?: string | null;
  cursor?: string | null;
  limit?: number;
  view?: "all" | "upcoming" | "review_eligibility";
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const POSTGRES_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

function isValidGregorianTimestampMatch(match: RegExpExecArray): boolean {
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const timezone = match[8];

  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  if (timezone !== "Z") {
    const offsetHour = Number(timezone.slice(1, 3));
    const offsetMinute = Number(timezone.slice(4, 6));
    if (offsetHour > 15 || offsetMinute > 59) return false;
  }
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1];
}

function parsePostgresTimestampSortKey(value: string): { epochSecond: number; fraction: string } | null {
  const match = POSTGRES_TIMESTAMP_PATTERN.exec(value.trim());
  if (!match || !isValidGregorianTimestampMatch(match)) return null;
  const parsedMs = Date.parse(value);
  if (!Number.isFinite(parsedMs)) return null;
  return {
    epochSecond: Math.floor(parsedMs / 1000),
    fraction: (match[7] ?? "").padEnd(6, "0"),
  };
}

export function compareCustomerBookingRowsDesc(
  a: Pick<BookingRow, "id" | "created_at">,
  b: Pick<BookingRow, "id" | "created_at">,
): number {
  const aKey = parsePostgresTimestampSortKey(String(a.created_at ?? ""));
  const bKey = parsePostgresTimestampSortKey(String(b.created_at ?? ""));
  const aSecond = aKey?.epochSecond ?? 0;
  const bSecond = bKey?.epochSecond ?? 0;
  if (aSecond !== bSecond) return bSecond - aSecond;
  const fractionOrder = (bKey?.fraction ?? "").localeCompare(aKey?.fraction ?? "");
  if (fractionOrder !== 0) return fractionOrder;
  return String(b.id ?? "").localeCompare(String(a.id ?? ""));
}

export function normalizeCustomerBookingsPageLimit(input: number | undefined): number {
  if (!Number.isFinite(input)) return CUSTOMER_BOOKINGS_PAGE_DEFAULT_LIMIT;
  return Math.min(CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT, Math.max(1, Math.trunc(input!)));
}

export function encodeCustomerBookingsCursor(
  row: Pick<BookingRow, "id" | "created_at">,
  sourceState?: Pick<BookingCursor, "ownedExhausted" | "orphanExhausted">,
): string {
  const createdAt = String(row.created_at ?? "").trim();
  if (!parsePostgresTimestampSortKey(createdAt) || !UUID_PATTERN.test(String(row.id))) {
    throw new Error("Cannot encode an invalid customer bookings cursor.");
  }
  return Buffer.from(
    JSON.stringify({ createdAt, id: String(row.id), ...sourceState } satisfies BookingCursor),
    "utf8",
  ).toString("base64url");
}

export function decodeCustomerBookingsCursor(raw: string | null | undefined): BookingCursor | null {
  const value = raw?.trim();
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<BookingCursor>;
    const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
    const createdAt = typeof parsed.createdAt === "string" ? parsed.createdAt.trim() : "";
    if (!UUID_PATTERN.test(id) || !parsePostgresTimestampSortKey(createdAt)) return null;
    return {
      createdAt,
      id,
      ...(parsed.ownedExhausted === true ? { ownedExhausted: true as const } : {}),
      ...(parsed.orphanExhausted === true ? { orphanExhausted: true as const } : {}),
    };
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
    view: "all" | "upcoming" | "review_eligibility";
  },
): Promise<{ data: unknown[] | null; error: { message: string } | null }> {
  const select = buildCustomerBookingSelect(args.ownershipColumn);
  let query = admin
    .from("bookings")
    .select(select)
    .neq("status", "payment_expired");

  if (args.view === "upcoming") {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    query = query
      .gte("date", cutoff)
      .is("completed_at", null);
  }

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
  const view = options?.view === "upcoming"
    ? "upcoming"
    : options?.view === "review_eligibility" ? "review_eligibility" : "all";

  const owned = cursor?.ownedExhausted
    ? { data: [] as unknown[], error: null }
    : await loadSourceRows(admin, {
        ownershipColumn,
        userId,
        cursor,
        fetchLimit,
        view,
      });
  if (owned.error) {
    void reportOperationalIssue("error", "customer/bookings/page", owned.error.message, { userId, ownershipColumn });
    return { ok: false, error: "Could not load bookings.", status: 500 };
  }

  const rawRows = ((owned.data ?? []) as BookingRow[]).map((row) => normalizeBookingCustomerIdentity(row));
  let orphanRowCount = 0;
  let orphanQueryFailed = false;
  if (viewerNorm.length >= 3 && !cursor?.orphanExhausted) {
    const orphan = await loadSourceRows(admin, {
      ownershipColumn,
      viewerNorm,
      cursor,
      fetchLimit,
      view,
    });
    if (orphan.error) {
      orphanQueryFailed = true;
      if (view === "review_eligibility") {
        return { ok: false, error: "Could not load complete review eligibility.", status: 500 };
      }
      void reportOperationalIssue("warn", "customer/bookings/page_email_orphan", orphan.error.message, { userId });
    } else if (orphan.data?.length) {
      orphanRowCount = orphan.data.length;
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

  const ordered = Array.from(deduped.values()).sort(compareCustomerBookingRowsDesc);
  const hasMore = ordered.length > limit;
  const rows = ordered.slice(0, limit).map((row) => attachCanonicalCustomerBookingLifecycle(row));

  await enrichRowsWithCleanerDisplayNames(admin, rows, userId);
  await enrichCustomerBookingRowsFromSavedAddresses(admin, rows);

  const last = rows.at(-1);
  const sourceState = {
    ...(cursor?.ownedExhausted || (owned.data?.length ?? 0) === 0 ? { ownedExhausted: true as const } : {}),
    ...(cursor?.orphanExhausted || viewerNorm.length < 3 || (!orphanQueryFailed && orphanRowCount === 0)
      ? { orphanExhausted: true as const }
      : {}),
  };
  return {
    ok: true,
    bookings: rows,
    pageInfo: {
      hasMore,
      nextCursor: hasMore && last ? encodeCustomerBookingsCursor(last, sourceState) : null,
    },
  };
}
