import "server-only";



import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizeOfficePayoutPeriodRange } from "@/lib/admin/payouts/officePayoutPeriodReport";

import {

  loadExistingPaystackRefs,

  loadPaidPaystackEntitiesInRange,

} from "@/lib/payments/paystackPaymentGaps";



export type ReconciliationRow = {
  gateway_reference: string;
  gateway: string;
  entity_type: string;
  entity_id: string;
  paid_at: string | null;
  payment_amount_cents: number | null;
  payment_processing_fee_cents: number | null;
  payment_net_settlement_cents: number | null;
  payment_settlement_status: string | null;
  payment_fee_method: string | null;
  expense_id: string | null;
  expense_amount_cents: number | null;
  booking_amount_cents: number | null;
  zoho_payment_id: string | null;
  zoho_expense_id: string | null;
  zoho_invoice_id: string | null;
  zoho_sync_status: string | null;
  expense_sync_status: string | null;
  issues: string[];
};

export type PaymentReconciliationPayload = {
  period: { from: string; to: string };
  summary: {
    total_transactions: number;
    total_gross_cents: number;
    total_fees_cents: number;
    total_net_cents: number;
    missing_expense_count: number;
    amount_mismatch_count: number;
    missing_payment_record_count: number;
    failed_zoho_sync_count: number;
    missing_zoho_payment_count: number;
    missing_by_entity: {
      booking: number;
      monthly_invoice: number;
      sales_document: number;
    };
  };
  failed_syncs: Array<{
    id: string;
    entity_type: string;
    entity_id: string;
    sync_errors: string | null;
    retry_count: number;
  }>;
  rows: ReconciliationRow[];
};



async function resolveSourceAmountCents(

  admin: SupabaseClient,

  entityType: string,

  entityId: string,

): Promise<number | null> {

  if (entityType === "booking") {

    const { data } = await admin

      .from("bookings")

      .select("amount_paid_cents, total_paid_cents, total_paid_zar")

      .eq("id", entityId)

      .maybeSingle();

    if (!data) return null;

    return (

      data.amount_paid_cents ??

      data.total_paid_cents ??

      (data.total_paid_zar != null ? Math.round(Number(data.total_paid_zar) * 100) : null)

    );

  }

  if (entityType === "monthly_invoice") {

    const { data } = await admin

      .from("monthly_invoices")

      .select("amount_paid_cents")

      .eq("id", entityId)

      .maybeSingle();

    if (!data) return null;

    const paid = Math.round(Number(data.amount_paid_cents ?? 0));

    return paid > 0 ? paid : null;

  }

  if (entityType === "sales_document") {

    const { data } = await admin

      .from("sales_documents")

      .select("amount_paid_cents")

      .eq("id", entityId)

      .maybeSingle();

    if (!data) return null;

    const paid = Math.round(Number(data.amount_paid_cents ?? 0));

    return paid > 0 ? paid : null;

  }

  return null;

}



async function resolveSourceReference(

  admin: SupabaseClient,

  entityType: string,

  entityId: string,

): Promise<string | null> {

  if (entityType === "booking") {

    const { data } = await admin.from("bookings").select("paystack_reference").eq("id", entityId).maybeSingle();

    return data?.paystack_reference ?? null;

  }

  if (entityType === "monthly_invoice") {

    const { data } = await admin.from("monthly_invoices").select("paystack_reference").eq("id", entityId).maybeSingle();

    return data?.paystack_reference ?? null;

  }

  if (entityType === "sales_document") {

    const { data } = await admin.from("sales_documents").select("paystack_reference").eq("id", entityId).maybeSingle();

    return data?.paystack_reference ?? null;

  }

  return null;

}



async function resolveZohoInvoiceId(
  admin: SupabaseClient,
  entityType: string,
  entityId: string,
): Promise<string | null> {
  if (entityType === "booking") {
    const { data } = await admin.from("bookings").select("zoho_invoice_id").eq("id", entityId).maybeSingle();
    return data?.zoho_invoice_id ?? null;
  }
  if (entityType === "monthly_invoice") {
    const { data } = await admin.from("monthly_invoices").select("zoho_invoice_id").eq("id", entityId).maybeSingle();
    return data?.zoho_invoice_id ?? null;
  }
  if (entityType === "sales_document") {
    const { data } = await admin.from("sales_documents").select("zoho_invoice_id").eq("id", entityId).maybeSingle();
    return data?.zoho_invoice_id ?? null;
  }
  return null;
}

export async function loadPaymentReconciliation(

  admin: SupabaseClient,

  fromRaw?: string | null,

  toRaw?: string | null,

): Promise<PaymentReconciliationPayload> {

  const { from, to } = normalizeOfficePayoutPeriodRange(fromRaw, toRaw);



  const { data: transactions } = await admin

    .from("payment_transactions")

    .select(
      "id, gateway, gateway_reference, entity_type, entity_id, amount_cents, processing_fee_cents, net_settlement_cents, settlement_status, fee_calculation_method, expense_id, booking_id, paid_at, external_accounting_id, sync_status",
    )

    .eq("gateway", "paystack")

    .gte("paid_at", `${from}T00:00:00`)

    .lte("paid_at", `${to}T23:59:59`)

    .order("paid_at", { ascending: false });



  const rows: ReconciliationRow[] = [];

  let missingExpense = 0;
  let amountMismatch = 0;
  let failedZohoSync = 0;
  let missingZohoPayment = 0;

  for (const tx of transactions ?? []) {
    const issues: string[] = [];
    let expenseAmount: number | null = null;
    let zohoExpenseId: string | null = null;
    let expenseSyncStatus: string | null = null;

    if (tx.expense_id) {
      const { data: exp } = await admin
        .from("expenses")
        .select("amount_cents, external_accounting_id, sync_status")
        .eq("id", tx.expense_id)
        .maybeSingle();

      expenseAmount = exp?.amount_cents ?? null;
      zohoExpenseId = exp?.external_accounting_id ?? null;
      expenseSyncStatus = exp?.sync_status ?? null;

      if (expenseAmount != null && expenseAmount !== tx.processing_fee_cents) {
        issues.push("fee_expense_amount_mismatch");
        amountMismatch += 1;
      }
      if ((tx.processing_fee_cents ?? 0) > 0 && exp?.sync_status === "failed") {
        issues.push("zoho_expense_sync_failed");
        failedZohoSync += 1;
      }
      if ((tx.processing_fee_cents ?? 0) > 0 && !exp?.external_accounting_id && exp?.sync_status !== "synced") {
        issues.push("missing_zoho_expense");
      }
    } else if ((tx.processing_fee_cents ?? 0) > 0) {
      issues.push("missing_fee_expense");
      missingExpense += 1;
    }

    if (tx.sync_status === "failed") {
      issues.push("zoho_payment_sync_failed");
      failedZohoSync += 1;
    }
    if (!tx.external_accounting_id && tx.sync_status !== "synced") {
      const zohoInvId = await resolveZohoInvoiceId(admin, tx.entity_type, tx.entity_id);
      if (zohoInvId) {
        issues.push("missing_zoho_payment");
        missingZohoPayment += 1;
      }
    }

    const zohoInvoiceId = await resolveZohoInvoiceId(admin, tx.entity_type, tx.entity_id);



    const sourceAmount = await resolveSourceAmountCents(admin, tx.entity_type, tx.entity_id);

    if (sourceAmount != null && sourceAmount !== tx.amount_cents) {

      issues.push("entity_amount_mismatch");

      amountMismatch += 1;

    }



    const sourceRef = await resolveSourceReference(admin, tx.entity_type, tx.entity_id);

    if (sourceRef && sourceRef !== tx.gateway_reference) {

      issues.push("reference_mismatch");

    }



    rows.push({
      gateway_reference: tx.gateway_reference,
      gateway: tx.gateway,
      entity_type: tx.entity_type,
      entity_id: tx.entity_id,
      paid_at: tx.paid_at,
      payment_amount_cents: tx.amount_cents,
      payment_processing_fee_cents: tx.processing_fee_cents,
      payment_net_settlement_cents: tx.net_settlement_cents,
      payment_settlement_status: tx.settlement_status,
      payment_fee_method: tx.fee_calculation_method,
      expense_id: tx.expense_id,
      expense_amount_cents: expenseAmount,
      booking_amount_cents: sourceAmount,
      zoho_payment_id: tx.external_accounting_id ?? null,
      zoho_expense_id: zohoExpenseId,
      zoho_invoice_id: zohoInvoiceId,
      zoho_sync_status: tx.sync_status ?? null,
      expense_sync_status: expenseSyncStatus,
      issues,
    });

  }



  const paidEntities = await loadPaidPaystackEntitiesInRange(admin, from, to);

  const ledgerRefs = await loadExistingPaystackRefs(

    admin,

    paidEntities.map((e) => e.gateway_reference),

  );



  const missingByEntity = { booking: 0, monthly_invoice: 0, sales_document: 0 };

  const seenRefs = new Set(rows.map((r) => r.gateway_reference));



  for (const entity of paidEntities) {

    if (ledgerRefs.has(entity.gateway_reference) || seenRefs.has(entity.gateway_reference)) continue;



    missingByEntity[entity.entity_type] += 1;

    seenRefs.add(entity.gateway_reference);

    rows.push({

      gateway_reference: entity.gateway_reference,

      gateway: "paystack",

      entity_type: entity.entity_type,

      entity_id: entity.entity_id,

      paid_at: entity.paid_at,

      payment_amount_cents: null,

      payment_processing_fee_cents: null,

      payment_net_settlement_cents: null,

      payment_settlement_status: null,

      payment_fee_method: null,

      expense_id: null,

      expense_amount_cents: null,

      booking_amount_cents: entity.amount_cents,
      zoho_payment_id: null,
      zoho_expense_id: null,
      zoho_invoice_id: null,
      zoho_sync_status: null,
      expense_sync_status: null,
      issues: ["missing_payment_transaction"],
    });

  }



  const missingPaymentRecord =

    missingByEntity.booking + missingByEntity.monthly_invoice + missingByEntity.sales_document;



  const totalGross = (transactions ?? []).reduce((s, t) => s + (t.amount_cents ?? 0), 0);

  const totalFees = (transactions ?? []).reduce((s, t) => s + (t.processing_fee_cents ?? 0), 0);

  const totalNet = (transactions ?? []).reduce((s, t) => s + (t.net_settlement_cents ?? 0), 0);



  const { data: failedSyncs } = await admin
    .from("accounting_sync_records")
    .select("id, entity_type, entity_id, sync_errors, retry_count")
    .eq("sync_status", "failed")
    .order("updated_at", { ascending: false })
    .limit(50);

  return {
    period: { from, to },
    summary: {
      total_transactions: (transactions ?? []).length,
      total_gross_cents: totalGross,
      total_fees_cents: totalFees,
      total_net_cents: totalNet,
      missing_expense_count: missingExpense,
      amount_mismatch_count: amountMismatch,
      missing_payment_record_count: missingPaymentRecord,
      failed_zoho_sync_count: failedZohoSync,
      missing_zoho_payment_count: missingZohoPayment,
      missing_by_entity: missingByEntity,
    },
    failed_syncs: failedSyncs ?? [],
    rows: rows.sort((a, b) => (b.paid_at ?? "").localeCompare(a.paid_at ?? "")),
  };
}


