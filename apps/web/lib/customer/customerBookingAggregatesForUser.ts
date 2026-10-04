import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingRow } from "@/lib/dashboard/types";
import { loadCustomerBookingPageForUser, CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT } from "@/lib/customer/customerBookingPageForUser";

export async function loadCustomerBookingAggregateRowsForUser(
  admin: SupabaseClient,
  userId: string,
  options?: { viewerEmail?: string | null },
): Promise<{ ok: true; bookings: BookingRow[] } | { ok: false; error: string; status: number }> {
  const bookings: BookingRow[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | null = null;

  do {
    const out = await loadCustomerBookingPageForUser(admin, userId, {
      viewerEmail: options?.viewerEmail,
      cursor,
      limit: CUSTOMER_BOOKINGS_PAGE_MAX_LIMIT,
      view: "all",
    });
    if (!out.ok) return out;
    bookings.push(...out.bookings);
    const nextCursor = out.pageInfo.hasMore ? out.pageInfo.nextCursor : null;
    if (!nextCursor) return { ok: true, bookings };
    if (seenCursors.has(nextCursor)) {
      return { ok: false, error: "Bookings aggregate pagination did not converge.", status: 500 };
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);

  return { ok: true, bookings };
}
