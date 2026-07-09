import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePaystackProcessingFee } from "@/lib/payments/paystackFeeCalculation";
import type {
  PaystackChargePayload,
  PaymentEntityType,
  PaymentGateway,
  PaymentTransactionRow,
} from "@/lib/payments/paymentTransactionTypes";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { enqueueAccountingSync } from "@/lib/accounting/accountingSyncQueue";
import {
  ensurePaystackVendor,
  loadZohoIntegrationSettings,
} from "@/lib/accounting/zohoIntegrationSettings";

export type RecordGatewayPaymentParams = {
  gateway: PaymentGateway;
  gatewayReference: string;
  entityType: PaymentEntityType;
  entityId: string;
  amountCents: number;
  currencyCode?: string;
  paidAtIso?: string | null;
  paystackChargeData?: PaystackChargePayload;
  bookingId?: string | null;
};

export type RecordGatewayPaymentResult =
  | { ok: true; created: boolean; paymentTransactionId: string; expenseId: string | null }
  | { ok: false; error: string };

async function resolveBranchIdForEntity(
  admin: SupabaseClient,
  entityType: PaymentEntityType,
  entityId: string,
  bookingId?: string | null,
): Promise<string | null> {
  if (bookingId) {
    const { data } = await admin.from("bookings").select("city_id").eq("id", bookingId).maybeSingle();
    if (data?.city_id) return data.city_id;
  }
  if (entityType === "booking") {
    const { data } = await admin.from("bookings").select("city_id").eq("id", entityId).maybeSingle();
    if (data?.city_id) return data.city_id;
  }
  const { data: city } = await admin.from("cities").select("id").eq("is_active", true).limit(1).maybeSingle();
  return city?.id ?? null;
}

async function resolvePaystackFeesCategoryId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("expense_categories")
    .select("id")
    .eq("group_name", "Technology")
    .eq("name", "Paystack Fees")
    .maybeSingle();
  return data?.id ?? null;
}

async function resolveInvoiceNumberForBooking(
  admin: SupabaseClient,
  bookingId: string | null,
): Promise<string | null> {
  if (!bookingId) return null;
  const { data } = await admin
    .from("bookings")
    .select("zoho_invoice_number")
    .eq("id", bookingId)
    .maybeSingle();
  return data?.zoho_invoice_number ?? null;
}
async function resolvePaystackAccountId(admin: SupabaseClient): Promise<string | null> {
  const { data } = await admin
    .from("expense_accounts")
    .select("id")
    .eq("account_type", "paystack")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (data?.id) return data.id;
  const { data: byName } = await admin
    .from("expense_accounts")
    .select("id")
    .ilike("name", "%paystack%")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return byName?.id ?? null;
}

/**
 * Idempotent: one payment_transaction per (gateway, gateway_reference).
 * Auto-creates an approved Paystack Fees expense linked to booking/payment.
 */
export async function recordGatewayPayment(
  admin: SupabaseClient,
  params: RecordGatewayPaymentParams,
): Promise<RecordGatewayPaymentResult> {
  const ref = params.gatewayReference.trim();
  if (!ref) return { ok: false, error: "missing_reference" };

  const amountCents = Math.max(0, Math.round(params.amountCents));
  if (amountCents <= 0) return { ok: false, error: "invalid_amount" };

  const { data: existing } = await admin
    .from("payment_transactions")
    .select("id, expense_id")
    .eq("gateway", params.gateway)
    .eq("gateway_reference", ref)
    .maybeSingle();

  if (existing?.id) {
    return {
      ok: true,
      created: false,
      paymentTransactionId: existing.id,
      expenseId: existing.expense_id ?? null,
    };
  }

  const fee = resolvePaystackProcessingFee(amountCents, params.paystackChargeData ?? {});
  const netSettlement = Math.max(0, amountCents - fee.processing_fee_cents);
  const now = new Date().toISOString();
  const paidAt = params.paidAtIso ?? now;
  const bookingId = params.bookingId ?? (params.entityType === "booking" ? params.entityId : null);

  const gatewayTxId =
    params.paystackChargeData?.id != null ? String(params.paystackChargeData.id) : null;

  const { data: inserted, error: insErr } = await admin
    .from("payment_transactions")
    .insert({
      gateway: params.gateway,
      gateway_reference: ref,
      gateway_transaction_id: gatewayTxId,
      entity_type: params.entityType,
      entity_id: params.entityId,
      amount_cents: amountCents,
      currency_code: params.currencyCode ?? "ZAR",
      processing_fee_cents: fee.processing_fee_cents,
      processing_fee_vat_cents: fee.processing_fee_vat_cents,
      net_settlement_cents: netSettlement,
      fee_calculation_method: fee.fee_calculation_method,
      settlement_status: "pending",
      payment_channel: fee.payment_channel,
      booking_id: bookingId,
      raw_gateway_payload: params.paystackChargeData ?? null,
      paid_at: paidAt,
      created_at: now,
      updated_at: now,
    })
    .select("id")
    .single();

  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      const { data: race } = await admin
        .from("payment_transactions")
        .select("id, expense_id")
        .eq("gateway", params.gateway)
        .eq("gateway_reference", ref)
        .maybeSingle();
      if (race?.id) {
        return {
          ok: true,
          created: false,
          paymentTransactionId: race.id,
          expenseId: race.expense_id ?? null,
        };
      }
    }
    return { ok: false, error: insErr.message };
  }

  const paymentTransactionId = inserted.id;
  let expenseId: string | null = null;

  if (fee.processing_fee_cents > 0) {
    const categoryId = await resolvePaystackFeesCategoryId(admin);
    const branchId = await resolveBranchIdForEntity(admin, params.entityType, params.entityId, bookingId);
    const accountId = await resolvePaystackAccountId(admin);

    if (categoryId && branchId) {
      const settings = await loadZohoIntegrationSettings(admin);
      const paystackVendorId = await ensurePaystackVendor(admin, settings);
      const invoiceNumber = await resolveInvoiceNumberForBooking(admin, bookingId);
      const feeDescription = invoiceNumber
        ? `Paystack processing fee for Invoice ${invoiceNumber}`
        : `Paystack processing fee — ${ref}`;
      const expenseDate = paidAt.slice(0, 10);
      const { data: expense, error: expErr } = await admin
        .from("expenses")
        .insert({
          expense_date: expenseDate,
          category_id: categoryId,
          vendor_id: paystackVendorId,
          description: feeDescription,
          amount_cents: fee.processing_fee_cents,
          payment_method: "paystack",
          paid_from_account_id: accountId,
          branch_id: branchId,
          booking_id: bookingId,
          notes: `Auto-recorded (${fee.fee_calculation_method}). Gross: R${(amountCents / 100).toFixed(2)}, net: R${(netSettlement / 100).toFixed(2)}. Ref: ${ref}`,
          status: "approved",
          approval_stage: "complete",
          approved_at: now,
          payment_transaction_id: paymentTransactionId,
          processing_fees_cents: fee.processing_fee_cents,
          sync_status: "pending",
        })
        .select("id")
        .single();

      if (!expErr && expense?.id) {
        expenseId = expense.id;
        await admin
          .from("payment_transactions")
          .update({ expense_id: expenseId, updated_at: now })
          .eq("id", paymentTransactionId);
        void enqueueAccountingSync(admin, { entityType: "expense", entityId: expense.id });
        if (paystackVendorId) {
          void enqueueAccountingSync(admin, { entityType: "vendor", entityId: paystackVendorId });
        }
      }
    }
  }

  void enqueueAccountingSync(admin, {
    entityType: "payment_transaction",
    entityId: paymentTransactionId,
  });

  if (bookingId) {
    await admin
      .from("bookings")
      .update({ payment_transaction_id: paymentTransactionId })
      .eq("id", bookingId);
  }

  await logSystemEvent({
    level: "info",
    source: "payments/recordGatewayPayment",
    message: "payment_transaction_recorded",
    context: {
      gateway: params.gateway,
      reference: ref,
      entity_type: params.entityType,
      entity_id: params.entityId,
      processing_fee_cents: fee.processing_fee_cents,
      fee_calculation_method: fee.fee_calculation_method,
      expense_id: expenseId,
    },
  });

  return { ok: true, created: true, paymentTransactionId, expenseId };
}

export async function loadPaymentTransactionForBooking(
  admin: SupabaseClient,
  bookingId: string,
): Promise<PaymentTransactionRow | null> {
  const { data } = await admin
    .from("payment_transactions")
    .select("*")
    .eq("entity_type", "booking")
    .eq("entity_id", bookingId)
    .order("paid_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PaymentTransactionRow | null) ?? null;
}

export async function loadPaymentTransactionByReference(
  admin: SupabaseClient,
  gateway: PaymentGateway,
  gatewayReference: string,
): Promise<PaymentTransactionRow | null> {
  const { data } = await admin
    .from("payment_transactions")
    .select("*")
    .eq("gateway", gateway)
    .eq("gateway_reference", gatewayReference)
    .maybeSingle();
  return (data as PaymentTransactionRow | null) ?? null;
}
