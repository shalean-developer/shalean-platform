import "server-only";

import { bookingPaidAmountColumnsFromCents } from "@/lib/booking/bookingPaidAmountColumns";
import { preservePaymentCustomerIdentity } from "@/lib/booking/paymentCustomerIdentityGuard";
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

export type PaymentFinalizationObservedPendingBooking = {
  id: string;
  status: string;
  customerEmail: string | null;
  customerAuthId: string | null;
  paystackReference: string | null;
};

export function paymentFinalizationConflict(): DbError {
  return {
    code: "PAYMENT_FINALIZATION_CONFLICT",
    message: "Pending booking changed during payment finalization.",
  };
}

/** One write compares raw values captured by the original read, including NULLs. */
export async function updateObservedPendingPaymentBooking(params: {
  supabase: SupabaseClient;
  row: Record<string, unknown>;
  observed: PaymentFinalizationObservedPendingBooking;
  ownershipColumn: BookingCustomerOwnershipColumn;
}): Promise<{ data: PaymentFinalizationPersistedBookingRow | null; error: DbError | null }> {
  const { supabase, row, observed, ownershipColumn } = params;
  if (
    !observed.id || observed.status !== "pending_payment" ||
    [observed.customerEmail, observed.customerAuthId, observed.paystackReference]
      .some((value) => value !== null && typeof value !== "string")
  ) {
    return { data: null, error: paymentFinalizationConflict() };
  }
  const identity = preservePaymentCustomerIdentity(observed, {
    customerEmail: typeof row.customer_email === "string" ? row.customer_email : null,
    customerAuthId: typeof row[ownershipColumn] === "string" ? row[ownershipColumn] as string : null,
  });
  if (identity.error) return { data: null, error: identity.error };
  const patch = {
    ...row,
    customer_email: identity.identity.customerEmail,
    [ownershipColumn]: identity.identity.customerAuthId,
  };
  let query = supabase.from("bookings").update(patch)
    .eq("id", observed.id)
    .eq("status", observed.status);
  for (const [column, value] of [
    ["customer_email", observed.customerEmail],
    [ownershipColumn, observed.customerAuthId],
    ["paystack_reference", observed.paystackReference],
  ] as const) {
    query = value === null ? query.is(column, null) : query.eq(column, value);
  }
  const result = await query.select(paymentFinalizationSelect(ownershipColumn)).maybeSingle();
  if (result.error) return { data: null, error: result.error };
  if (!result.data || typeof result.data !== "object" || !("id" in result.data)) {
    return { data: null, error: paymentFinalizationConflict() };
  }
  return { data: result.data as PaymentFinalizationPersistedBookingRow, error: null };
}

export async function finalizePendingPaymentBookingFromPaystack(params: {
  supabase: SupabaseClient;
  row: Record<string, unknown>;
  observed: PaymentFinalizationObservedPendingBooking;
  ownershipColumn: BookingCustomerOwnershipColumn;
}): Promise<{ data: PaymentFinalizationPersistedBookingRow | null; error: DbError | null }> {
  return updateObservedPendingPaymentBooking({
    ...params,
    row: normalizePaystackFinalizationPaidAmountRow(params.row),
  });
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
