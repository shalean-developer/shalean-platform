import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

export type PaymentFinalizationPersistedBookingRow = {
  id: string;
  created_at?: string;
  user_id?: string | null;
};

type DbError = { message: string; code?: string };

export async function finalizePendingPaymentBookingFromPaystack(params: {
  supabase: SupabaseClient;
  row: Record<string, unknown>;
  pendingFinalizeMatch: "paystack_reference" | "id";
  existingPendingPaymentId: string;
  paystackReference: string;
}): Promise<{ data: PaymentFinalizationPersistedBookingRow | null; error: DbError | null }> {
  const { supabase, row, pendingFinalizeMatch, existingPendingPaymentId, paystackReference } = params;
  const result =
    pendingFinalizeMatch === "id"
      ? await supabase
          .from("bookings")
          .update(row)
          .eq("id", existingPendingPaymentId)
          .eq("status", "pending_payment")
          .select("id, created_at, user_id")
          .maybeSingle()
      : await supabase
          .from("bookings")
          .update(row)
          .eq("paystack_reference", paystackReference)
          .eq("status", "pending_payment")
          .select("id, created_at, user_id")
          .maybeSingle();

  return {
    data:
      result.data && typeof result.data === "object" && "id" in result.data
        ? (result.data as PaymentFinalizationPersistedBookingRow)
        : null,
    error: result.error,
  };
}

export async function insertFinalizedBookingFromPaystack(params: {
  supabase: SupabaseClient;
  row: Record<string, unknown>;
}): Promise<{ data: PaymentFinalizationPersistedBookingRow | null; error: DbError | null }> {
  const { data, error } = await params.supabase
    .from("bookings")
    .insert(params.row)
    .select("id, created_at, user_id")
    .maybeSingle();

  return {
    data: data && typeof data === "object" && "id" in data ? (data as PaymentFinalizationPersistedBookingRow) : null,
    error,
  };
}

export async function markBookingPaidFromAdminSettlement(params: {
  admin: SupabaseClient;
  bookingId: string;
  patch: Record<string, unknown>;
}): Promise<{ data: Array<{ id: string }> | null; error: DbError | null }> {
  const { data, error } = await params.admin
    .from("bookings")
    .update(params.patch)
    .eq("id", params.bookingId)
    .is("payment_completed_at", null)
    .not("status", "eq", "cancelled")
    .not("status", "eq", "failed")
    .select("id");

  return { data: data as Array<{ id: string }> | null, error };
}
