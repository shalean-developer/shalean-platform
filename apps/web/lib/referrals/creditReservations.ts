import type { SupabaseClient } from "@supabase/supabase-js";

type ReservationRpcRow = {
  ok?: boolean;
  reservation_id?: string | null;
  amount_zar?: number | string | null;
  balance_after_zar?: number | string | null;
  status?: string | null;
  error_message?: string | null;
};

function firstRow(data: unknown): ReservationRpcRow | null {
  if (Array.isArray(data)) return (data[0] as ReservationRpcRow | undefined) ?? null;
  return data && typeof data === "object" ? (data as ReservationRpcRow) : null;
}

export async function reserveCleaningCreditForBooking(params: {
  admin: SupabaseClient; userId: string; bookingId: string; amountZar: number;
}) {
  const { data, error } = await params.admin.rpc("reserve_cleaning_credit_for_booking", {
    p_user_id: params.userId, p_booking_id: params.bookingId, p_amount_zar: Math.max(0, Math.round(params.amountZar)),
  });
  if (error) return { ok: false as const, error: error.message };
  const row = firstRow(data);
  if (!row?.ok) return { ok: false as const, error: row?.error_message ?? "credit_reservation_failed" };
  return {
    ok: true as const,
    reservationId: String(row.reservation_id),
    amountZar: Math.max(0, Math.round(Number(row.amount_zar ?? 0))),
    balanceAfter: Number(row.balance_after_zar ?? 0),
    status: String(row.status ?? "reserved"),
  };
}

export async function settleCleaningCreditForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin.rpc("settle_cleaning_credit_for_booking", { p_booking_id: bookingId });
  if (error) return { ok: false as const, error: error.message };
  const row = firstRow(data);
  return row?.ok ? { ok: true as const, status: String(row.status ?? "settled") } :
    { ok: false as const, error: row?.error_message ?? "credit_settlement_failed" };
}

export async function releaseCleaningCreditForBooking(admin: SupabaseClient, bookingId: string) {
  const { data, error } = await admin.rpc("release_cleaning_credit_for_booking", { p_booking_id: bookingId });
  if (error) return { ok: false as const, error: error.message };
  const row = firstRow(data);
  return row?.ok ? { ok: true as const, status: String(row.status ?? "released") } :
    { ok: false as const, error: row?.error_message ?? "credit_release_failed" };
}
