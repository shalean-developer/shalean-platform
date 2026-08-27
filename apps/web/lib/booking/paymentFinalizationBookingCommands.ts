import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookingCustomerOwnershipColumn } from "@/lib/booking/bookingCustomerIdentity";
import { bookingPaidAmountColumnsFromCents } from "@/lib/booking/bookingPaidAmountColumns";
import { paymentCustomerIdentityMismatch } from "@/lib/booking/paymentCustomerIdentityGuard";

export type PaymentFinalizationPersistedBookingRow = {
  id: string;
  created_at?: string;
  customer_id?: string | null;
  user_id?: string | null;
};

type DbError = { message: string; code?: string };

function paymentFinalizationSelect(ownershipColumn: BookingCustomerOwnershipColumn): string {
  return `id, created_at, ${ownershipColumn}`;
}

/**
 * Successful Paystack settlement uses `amount_paid_cents` as the collected-cash SoT.
 * Normalize legacy mirror columns at the persistence boundary so callers cannot write
 * `total_paid_cents` / `total_paid_zar` values that disagree with settled cents.
 */
export function normalizePaystackFinalizationPaidAmountRow(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const raw = row.amount_paid_cents;
  const amountCents = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amountCents)) return row;
  return {
    ...row,
    ...bookingPaidAmountColumnsFromCents(amountCents),
  };
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
  const select = paymentFinalizationSelect(ownershipColumn);

  // SR-03A: the pending booking is the identity anchor. Payment finalization may
  // fill missing legacy identity, but it must never overwrite a conflicting
  // customer email or auth owner supplied by Paystack snapshot/metadata.
  const identityResult = await supabase
    .from("bookings")
    .select(`customer_email, ${ownershipColumn}`)
    .eq("id", existingPendingPaymentId)
    .eq("status", "pending_payment")
    .maybeSingle();

  if (identityResult.error) {
    return { data: null, error: identityResult.error };
  }

  if (identityResult.data && typeof identityResult.data === "object") {
    const existingIdentityRow = identityResult.data as Record<string, unknown>;
    const mismatch = paymentCustomerIdentityMismatch(
      {
        customerEmail:
          typeof existingIdentityRow.customer_email === "string"
            ? existingIdentityRow.customer_email
            : null,
        customerAuthId:
          typeof existingIdentityRow[ownershipColumn] === "string"
            ? String(existingIdentityRow[ownershipColumn])
            : null,
      },
      {
        customerEmail: typeof row.customer_email === "string" ? row.customer_email : null,
        customerAuthId:
          typeof row[ownershipColumn] === "string" ? String(row[ownershipColumn]) : null,
      },
    );

    if (mismatch) {
      return {
        data: null,
        error: {
          code: "PAYMENT_CUSTOMER_IDENTITY_MISMATCH",
          message: `Payment customer ${mismatch} does not match the pending booking.`,
        },
      };
    }
  }

  const normalizedRow = normalizePaystackFinalizationPaidAmountRow(row);
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
