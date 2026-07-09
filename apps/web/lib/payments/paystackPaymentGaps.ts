import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { bookingCustomerRevenueCents } from "@/lib/admin/payouts/officePayoutPeriodReport";
import type { PaymentEntityType } from "@/lib/payments/paymentTransactionTypes";

export type PaystackPaidEntity = {
  gateway_reference: string;
  entity_type: PaymentEntityType;
  entity_id: string;
  paid_at: string | null;
  amount_cents: number | null;
};

export async function loadExistingPaystackRefs(
  admin: SupabaseClient,
  refs: string[],
): Promise<Set<string>> {
  const unique = [...new Set(refs.map((r) => r.trim()).filter(Boolean))];
  if (unique.length === 0) return new Set();

  const found = new Set<string>();
  const chunkSize = 100;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const { data } = await admin
      .from("payment_transactions")
      .select("gateway_reference")
      .eq("gateway", "paystack")
      .in("gateway_reference", chunk);
    for (const row of data ?? []) {
      if (row.gateway_reference) found.add(row.gateway_reference);
    }
  }
  return found;
}

/** Paid Paystack charges on bookings, monthly invoices, and sales documents in a date range. */
export async function loadPaidPaystackEntitiesInRange(
  admin: SupabaseClient,
  from: string,
  to: string,
): Promise<PaystackPaidEntity[]> {
  const entities: PaystackPaidEntity[] = [];

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, paystack_reference, amount_paid_cents, total_paid_cents, total_paid_zar, payment_completed_at")
    .not("paystack_reference", "is", null)
    .gte("payment_completed_at", `${from}T00:00:00`)
    .lte("payment_completed_at", `${to}T23:59:59`);

  for (const b of bookings ?? []) {
    const ref = String(b.paystack_reference ?? "").trim();
    if (!ref) continue;
    entities.push({
      gateway_reference: ref,
      entity_type: "booking",
      entity_id: b.id,
      paid_at: b.payment_completed_at,
      amount_cents: bookingCustomerRevenueCents(b),
    });
  }

  const { data: invoices } = await admin
    .from("monthly_invoices")
    .select("id, paystack_reference, amount_paid_cents, total_amount_cents, updated_at, status")
    .not("paystack_reference", "is", null)
    .in("status", ["paid", "partially_paid"])
    .gt("amount_paid_cents", 0)
    .gte("updated_at", `${from}T00:00:00`)
    .lte("updated_at", `${to}T23:59:59`);

  for (const inv of invoices ?? []) {
    const ref = String(inv.paystack_reference ?? "").trim();
    if (!ref) continue;
    const paid = Math.round(Number(inv.amount_paid_cents ?? 0));
    entities.push({
      gateway_reference: ref,
      entity_type: "monthly_invoice",
      entity_id: inv.id,
      paid_at: inv.updated_at,
      amount_cents: paid > 0 ? paid : null,
    });
  }

  const { data: salesDocs } = await admin
    .from("sales_documents")
    .select("id, paystack_reference, amount_paid_cents, updated_at, status")
    .not("paystack_reference", "is", null)
    .eq("status", "paid")
    .gt("amount_paid_cents", 0)
    .gte("updated_at", `${from}T00:00:00`)
    .lte("updated_at", `${to}T23:59:59`);

  for (const doc of salesDocs ?? []) {
    const ref = String(doc.paystack_reference ?? "").trim();
    if (!ref) continue;
    entities.push({
      gateway_reference: ref,
      entity_type: "sales_document",
      entity_id: doc.id,
      paid_at: doc.updated_at,
      amount_cents: Math.round(Number(doc.amount_paid_cents ?? 0)) || null,
    });
  }

  return entities;
}

/** All paid entities with Paystack reference that lack a payment_transactions row. */
export async function loadMissingPaystackLedgerEntities(
  admin: SupabaseClient,
): Promise<PaystackPaidEntity[]> {
  const entities: PaystackPaidEntity[] = [];

  const { data: bookings } = await admin
    .from("bookings")
    .select("id, paystack_reference, amount_paid_cents, total_paid_cents, total_paid_zar, payment_completed_at")
    .not("paystack_reference", "is", null)
    .or("payment_completed_at.not.is.null,payment_status.eq.success");

  for (const b of bookings ?? []) {
    const ref = String(b.paystack_reference ?? "").trim();
    if (!ref) continue;
    entities.push({
      gateway_reference: ref,
      entity_type: "booking",
      entity_id: b.id,
      paid_at: b.payment_completed_at,
      amount_cents: bookingCustomerRevenueCents(b),
    });
  }

  const { data: invoices } = await admin
    .from("monthly_invoices")
    .select("id, paystack_reference, amount_paid_cents, updated_at, status")
    .not("paystack_reference", "is", null)
    .in("status", ["paid", "partially_paid"])
    .gt("amount_paid_cents", 0);

  for (const inv of invoices ?? []) {
    const ref = String(inv.paystack_reference ?? "").trim();
    if (!ref) continue;
    entities.push({
      gateway_reference: ref,
      entity_type: "monthly_invoice",
      entity_id: inv.id,
      paid_at: inv.updated_at,
      amount_cents: Math.round(Number(inv.amount_paid_cents ?? 0)) || null,
    });
  }

  const { data: salesDocs } = await admin
    .from("sales_documents")
    .select("id, paystack_reference, amount_paid_cents, updated_at, status")
    .not("paystack_reference", "is", null)
    .eq("status", "paid")
    .gt("amount_paid_cents", 0);

  for (const doc of salesDocs ?? []) {
    const ref = String(doc.paystack_reference ?? "").trim();
    if (!ref) continue;
    entities.push({
      gateway_reference: ref,
      entity_type: "sales_document",
      entity_id: doc.id,
      paid_at: doc.updated_at,
      amount_cents: Math.round(Number(doc.amount_paid_cents ?? 0)) || null,
    });
  }

  const refs = entities.map((e) => e.gateway_reference);
  const existing = await loadExistingPaystackRefs(admin, refs);
  return entities.filter((e) => !existing.has(e.gateway_reference));
}

export async function countMissingPaystackLedgerEntities(admin: SupabaseClient): Promise<number> {
  const missing = await loadMissingPaystackLedgerEntities(admin);
  return missing.length;
}
