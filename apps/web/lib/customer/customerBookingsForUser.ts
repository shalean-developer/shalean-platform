import type { SupabaseClient } from "@supabase/supabase-js";
import { CUSTOMER_BOOKING_SELECT } from "@/lib/dashboard/customerBookingSelect";
import type { BookingRow } from "@/lib/dashboard/types";
import { normalizeCustomerBookingRow } from "@/lib/dashboard/normalizeCustomerBookingRow";
import { reportOperationalIssue } from "@/lib/logging/systemLog";

export async function loadCustomerBookingRowsForUser(
  admin: SupabaseClient,
  userId: string,
): Promise<{ ok: true; bookings: BookingRow[] } | { ok: false; error: string; status: number }> {
  const { data, error } = await admin
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

  const rows = ((data ?? []) as unknown as BookingRow[]).map((r) => normalizeCustomerBookingRow(r));
  return { ok: true, bookings: rows };
}

export async function loadCustomerBookingRowForUser(
  admin: SupabaseClient,
  userId: string,
  bookingId: string,
): Promise<{ ok: true; booking: BookingRow } | { ok: false; error: string; status: number }> {
  const id = bookingId.trim();
  if (!id) {
    return { ok: false, error: "Missing booking id.", status: 400 };
  }
  const { data, error } = await admin
    .from("bookings")
    .select(CUSTOMER_BOOKING_SELECT)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

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
  return { ok: true, booking: row };
}
