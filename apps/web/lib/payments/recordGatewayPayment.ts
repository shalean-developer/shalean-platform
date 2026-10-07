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

async function paymentAccountingApplicability(
  admin: SupabaseClient,
  entityType: PaymentEntityType,
  entityId: string,
): Promise<{ applicable: true } | { applicable: false; reason: string }> {
  if (entityType !== "booking") return { applicable: true };

  const { data: booking } = await admin
    .from("bookings")
    .select("is_test, is_monthly_billing_booking, sales_document_id")
    .eq("id", entityId)
    .maybeSingle();

  if (!booking) return { applicable: true };
  if (booking.is_test === true) return { applicable: false, reason: "booking_test" };
  if (booking.is_monthly_billing_booking === true) {
    return { applicable: false, reason: "booking_monthly_owned" };
  }
  if (booking.sales_document_id) {
    return { applicable: false, reason: "booking_sales_document_owned" };
  }
  return { applicable: true };
}

async function ensureExpenseAccountingQueue(
  admin: SupabaseClient,
  expenseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await enqueueAccountingSync(admin, {
    entityType: "expense",
    entityId: expenseId,
  });

  const { data: existing, error: readErr } = await admin
    .from("accounting_sync_records")
    .select("id, sync_status")
    .eq("entity_type", "expense")
    .eq("entity_id", expenseId)
    .maybeSingle();

  if (!readErr && existing?.id) return { ok: true };

  const now = new Date().toISOString();
  const { error: insertErr } = await admin.from("accounting_sync_records").insert({
    entity_type: "expense",
    entity_id: expenseId,
    sync_status: "pending",
    created_at: now,
    updated_at: now,
  });

  if (insertErr && (insertErr as { code?: string }).code !== "23505") {
    await logSystemEvent({
      level: "error",
      source: "payments/recordGatewayPayment",
      message: "expense_accounting_queue_enrollment_failed",
      context: {
        expense_id: expenseId,
        read_error: readErr?.message ?? null,
        insert_error: insertErr.message,
      },
    });
    return { ok: false, error: insertErr.message };
  }
  return { ok: true };
}

async function ensurePaymentAccountingQueue(
  admin: SupabaseClient,
  paymentTransactionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await enqueueAccountingSync(admin, {
    entityType: "payment_transaction",
    entityId: paymentTransactionId,
  });

  const { data: existing, error: readErr } = await admin
    .from("accounting_sync_records")
    .select("id, sync_status")
    .eq("entity_type", "payment_transaction")
    .eq("entity_id", paymentTransactionId)
    .maybeSingle();

  if (!readErr && existing?.id) return { ok: true };

  const now = new Date().toISOString();
  const { error: insertErr } = await admin.from("accounting_sync_records").insert({
    entity_type: "payment_transaction",
    entity_id: paymentTransactionId,
    sync_status: "pending",
    created_at: now,
    updated_at: now,
  });

  if (insertErr && (insertErr as { code?: string }).code !== "23505") {
    await logSystemEvent({
      level: "error",
      source: "payments/recordGatewayPayment",
      message: "payment_accounting_queue_enrollment_failed",
      context: {
        payment_transaction_id: paymentTransactionId,
        read_error: readErr?.message ?? null,
        insert_error: insertErr.message,
      },
    });
    return { ok: false, error: insertErr.message };
  }
  return { ok: true };
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

  const fee = resolvePaystackProcessingFee(amountCents, params.paystackChargeData ?? {});
  const netSettlement = Math.max(0, amountCents - fee.processing_fee_cents);
  const now = new Date().toISOString();
  const paidAt = params.paidAtIso ?? now;
  const bookingId = params.bookingId ?? (params.entityType === "booking" ? params.entityId : null);

  const completeSideEffects = async (
    paymentTransactionId: string,
    existingExpenseId: string | null,
    created: boolean,
  ): Promise<RecordGatewayPaymentResult> => {
    let expenseId = existingExpenseId;

    if (fee.processing_fee_cents > 0) {
      if (!expenseId) {
        const { data: existingExpense, error: existingExpenseErr } = await admin
          .from("expenses")
          .select("id")
          .eq("payment_transaction_id", paymentTransactionId)
          .maybeSingle();
        if (existingExpenseErr) return { ok: false, error: existingExpenseErr.message };
        expenseId = existingExpense?.id ?? null;
      }

      if (!expenseId) {
        const categoryId = await resolvePaystackFeesCategoryId(admin);
        const branchId = await resolveBranchIdForEntity(admin, params.entityType, params.entityId, bookingId);
        const accountId = await resolvePaystackAccountId(admin);
        if (!categoryId || !branchId) {
          return { ok: false, error: "paystack_fee_expense_prerequisites_missing" };
        }

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

        if (expErr) {
          const { data: raceExpense } = await admin
            .from("expenses")
            .select("id")
            .eq("payment_transaction_id", paymentTransactionId)
            .maybeSingle();
          if (!raceExpense?.id) return { ok: false, error: expErr.message };
          expenseId = raceExpense.id;
        } else {
          expenseId = expense?.id ?? null;
        }

        if (!expenseId) return { ok: false, error: "paystack_fee_expense_missing" };

        if (paystackVendorId) {
          await enqueueAccountingSync(admin, { entityType: "vendor", entityId: paystackVendorId });
        }
      }

      const { error: expenseLinkErr } = await admin
        .from("payment_transactions")
        .update({ expense_id: expenseId, updated_at: now })
        .eq("id", paymentTransactionId);
      if (expenseLinkErr) return { ok: false, error: expenseLinkErr.message };

      if (expenseId) {
        const expenseQueue = await ensureExpenseAccountingQueue(admin, expenseId);
        if (!expenseQueue.ok) return { ok: false, error: expenseQueue.error };
      }
    }

    const accountingApplicability = await paymentAccountingApplicability(
      admin,
      params.entityType,
      params.entityId,
    );
    if (accountingApplicability.applicable) {
      const queue = await ensurePaymentAccountingQueue(admin, paymentTransactionId);
      if (!queue.ok) return { ok: false, error: queue.error };
    } else {
      const { error: ignoredErr } = await admin
        .from("payment_transactions")
        .update({
          sync_status: "ignored",
          sync_errors: `accounting_not_applicable:${accountingApplicability.reason}`,
          updated_at: now,
        })
        .eq("id", paymentTransactionId);
      if (ignoredErr) return { ok: false, error: ignoredErr.message };
    }

    if (bookingId) {
      const { error: bookingLinkErr } = await admin
        .from("bookings")
        .update({ payment_transaction_id: paymentTransactionId })
        .eq("id", bookingId);
      if (bookingLinkErr) return { ok: false, error: bookingLinkErr.message };
    }

    await logSystemEvent({
      level: "info",
      source: "payments/recordGatewayPayment",
      message: created ? "payment_transaction_recorded" : "payment_transaction_reconciled",
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

    return { ok: true, created, paymentTransactionId, expenseId };
  };

  const { data: existing, error: existingErr } = await admin
    .from("payment_transactions")
    .select("id, expense_id")
    .eq("gateway", params.gateway)
    .eq("gateway_reference", ref)
    .maybeSingle();
  if (existingErr) return { ok: false, error: existingErr.message };

  if (existing?.id) {
    return completeSideEffects(existing.id, existing.expense_id ?? null, false);
  }

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
      const { data: race, error: raceErr } = await admin
        .from("payment_transactions")
        .select("id, expense_id")
        .eq("gateway", params.gateway)
        .eq("gateway_reference", ref)
        .maybeSingle();
      if (raceErr) return { ok: false, error: raceErr.message };
      if (race?.id) return completeSideEffects(race.id, race.expense_id ?? null, false);
    }
    return { ok: false, error: insErr.message };
  }

  return completeSideEffects(inserted.id, null, true);
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
