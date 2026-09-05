import "server-only";

import { bookingPaidAmountColumnsFromCents } from "@/lib/booking/bookingPaidAmountColumns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingCustomerOwnershipColumn } from "@/lib/booking/bookingCustomerIdentity";

export type PaymentFinalizationPersistedBookingRow = {
  id: string;
  created_at?: string;
  customer_id?: string | null;
  user_id?: string | null;
};

type DbError = { message: string; code?: string };

function normalizePaystackFinalizationPaidAmountRow(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, ...bookingPaidAmountColumnsFromCents(row.amount_paid_cents) };
}

function paymentFinalizationSelect(ownershipColumn: BookingCustomerOwnershipColumn): string {
  return `id, created_at, ${ownershipColumn}`;
}

export async function finalizePendingPaymentBookingFromPaystack(params: {
  supabase: SupabaseClient;
  row: Record<string, unknown>;
  pendingFinalizeMatch: "paystack_reference" | "id";
  existingPendingPaymentId: string;
  paystackReference: string;
  ownershipColumn: BookingCustomerOwnershipColumn;
}): Promise<{ data: PaymentFinalizationPersistedBookingRow | null; error: DbError | null }> {
  const {
    supabase,
    row,
    pendingFinalizeMatch,
    existingPendingPaymentId,
    paystackReference,
    ownershipColumn,
  } = params;
  const normalizedRow = normalizePaystackFinalizationPaidAmountRow(row);
  const select = paymentFinalizationSelect(ownershipColumn);
  const result =
    pendingFinalizeMatch === "id"
      ? await supabase
          .from("bookings")
          .update(normalizedRow)
          .eq("id", existingPendingPaymentId)
          .eq("status", "pending_payment")
          .select(select)
          .maybeSingle()
      : await supabase
          .from("bookings")
          .update(normalizedRow)
          .eq("paystack_reference", paystackReference)
          .eq("status", "pending_payment")
          .select(select)
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
  ownershipColumn: BookingCustomerOwnershipColumn;
}): Promise<{ data: PaymentFinalizationPersistedBookingRow | null; error: DbError | null }> {
  const normalizedRow = normalizePaystackFinalizationPaidAmountRow(params.row);
  const { data, error } = await params.supabase
    .from("bookings")
    .insert(normalizedRow)
    .select(paymentFinalizationSelect(params.ownershipColumn))
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
