import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logSystemEvent } from "@/lib/logging/systemLog";
import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";

const DEFAULT_FNB_PRIMARY_ACCOUNT_ID = "253016000000097002";
const CONFIRMATION = "MOVE_VERIFIED_WEBSITE_RECEIPTS_TO_FNB_PRIMARY";

type ZohoPayment = {
  payment_id?: string;
  customer_id?: string;
  customer_name?: string;
  payment_mode?: string;
  amount?: number;
  date?: string;
  reference_number?: string;
  description?: string;
  account_id?: string;
  account_name?: string;
  invoices?: Array<{ invoice_id?: string; amount_applied?: number; tax_amount_withheld?: number }>;
};

type ZohoPaymentList = {
  customerpayments?: ZohoPayment[];
  payments?: ZohoPayment[];
  page_context?: { has_more_page?: boolean; page?: number };
};

type ZohoPaymentGet = { payment?: ZohoPayment; customerpayment?: ZohoPayment };

function targetAccountId(): string {
  return process.env.ZOHO_WEBSITE_RECEIPT_ACCOUNT_ID?.trim() || DEFAULT_FNB_PRIMARY_ACCOUNT_ID;
}

async function loadKnownWebsiteReferences(admin: SupabaseClient): Promise<Set<string>> {
  const refs = new Set<string>();
  const [bookings, monthly, sales] = await Promise.all([
    admin.from("bookings").select("payment_reference_external").not("payment_reference_external", "is", null).limit(5000),
    admin.from("monthly_invoices").select("paystack_reference").not("paystack_reference", "is", null).limit(5000),
    admin.from("sales_documents").select("paystack_reference").not("paystack_reference", "is", null).limit(5000),
  ]);

  for (const result of [bookings, monthly, sales]) {
    if (result.error) throw new Error(result.error.message);
  }
  for (const row of bookings.data ?? []) {
    const ref = String((row as { payment_reference_external?: string | null }).payment_reference_external ?? "").trim();
    if (ref) refs.add(ref);
  }
  for (const row of monthly.data ?? []) {
    const ref = String((row as { paystack_reference?: string | null }).paystack_reference ?? "").trim();
    if (ref) refs.add(ref);
  }
  for (const row of sales.data ?? []) {
    const ref = String((row as { paystack_reference?: string | null }).paystack_reference ?? "").trim();
    if (ref) refs.add(ref);
  }
  return refs;
}

async function listAllCustomerPayments(): Promise<ZohoPayment[]> {
  const all: ZohoPayment[] = [];
  for (let page = 1; page <= 25; page += 1) {
    const res = await zohoBooksClient.get<ZohoPaymentList>(`/customerpayments?page=${page}&per_page=200`);
    const rows = res.customerpayments ?? res.payments ?? [];
    all.push(...rows);
    if (!res.page_context?.has_more_page || rows.length === 0) break;
  }
  return all;
}

async function getPayment(paymentId: string): Promise<ZohoPayment> {
  const res = await zohoBooksClient.get<ZohoPaymentGet>(`/customerpayments/${encodeURIComponent(paymentId)}`);
  const payment = res.payment ?? res.customerpayment;
  if (!payment) throw new Error(`Zoho customer payment ${paymentId} not found`);
  return payment;
}

function isUndeposited(payment: ZohoPayment): boolean {
  const name = String(payment.account_name ?? "").trim().toLowerCase();
  return name === "undeposited funds" || name === "undeposited cash";
}

function updatePayload(payment: ZohoPayment, accountId: string) {
  const invoices = (payment.invoices ?? [])
    .map((i) => ({
      invoice_id: String(i.invoice_id ?? "").trim(),
      amount_applied: Number(i.amount_applied ?? 0),
      ...(Number(i.tax_amount_withheld ?? 0) ? { tax_amount_withheld: Number(i.tax_amount_withheld) } : {}),
    }))
    .filter((i) => i.invoice_id && i.amount_applied > 0);

  if (!payment.customer_id || !payment.payment_mode || !payment.date || !Number(payment.amount) || invoices.length === 0) {
    throw new Error(`Zoho payment ${payment.payment_id ?? "unknown"} is missing required update fields`);
  }

  return {
    customer_id: payment.customer_id,
    payment_mode: payment.payment_mode,
    amount: Number(payment.amount),
    date: payment.date,
    invoices,
    account_id: accountId,
    ...(payment.reference_number ? { reference_number: payment.reference_number } : {}),
    ...(payment.description ? { description: payment.description } : {}),
  };
}

export type HistoricalReceiptCleanupResult = {
  dry_run: boolean;
  target_account_id: string;
  scanned: number;
  matched: number;
  matched_amount_zar: number;
  moved: number;
  moved_amount_zar: number;
  candidates: Array<{
    payment_id: string;
    reference: string;
    customer_name: string | null;
    date: string | null;
    amount_zar: number;
    source_account: string | null;
  }>;
  skipped_unmatched_undeposited: number;
};

export async function reclassifyUndepositedWebsitePayments(
  admin: SupabaseClient,
  options: { apply?: boolean; confirmation?: string | null; actorUserId?: string | null } = {},
): Promise<HistoricalReceiptCleanupResult> {
  const apply = options.apply === true;
  if (apply && options.confirmation !== CONFIRMATION) {
    throw new Error(`confirmation_required:${CONFIRMATION}`);
  }

  const knownRefs = await loadKnownWebsiteReferences(admin);
  const listed = await listAllCustomerPayments();
  const accountId = targetAccountId();
  const candidates: HistoricalReceiptCleanupResult["candidates"] = [];
  let skippedUnmatched = 0;
  let moved = 0;
  let movedAmount = 0;

  for (const listedPayment of listed) {
    const paymentId = String(listedPayment.payment_id ?? "").trim();
    if (!paymentId) continue;

    // List responses may omit account/invoice detail, so fetch the authoritative record.
    const payment = await getPayment(paymentId);
    if (!isUndeposited(payment)) continue;

    const ref = String(payment.reference_number ?? "").trim();
    if (!ref || !knownRefs.has(ref)) {
      skippedUnmatched += 1;
      continue;
    }

    const amount = Number(payment.amount ?? 0);
    candidates.push({
      payment_id: paymentId,
      reference: ref,
      customer_name: payment.customer_name ?? null,
      date: payment.date ?? null,
      amount_zar: amount,
      source_account: payment.account_name ?? null,
    });

    if (!apply) continue;

    await zohoBooksClient.put(`/customerpayments/${encodeURIComponent(paymentId)}`, updatePayload(payment, accountId));
    moved += 1;
    movedAmount += amount;

    await logSystemEvent({
      level: "info",
      source: "zoho/historical_receipt_cleanup",
      message: "zoho_customer_payment_reclassified_to_fnb_primary",
      context: {
        payment_id: paymentId,
        reference: ref,
        amount_zar: amount,
        from_account: payment.account_name ?? null,
        to_account_id: accountId,
        actor_user_id: options.actorUserId ?? null,
      },
    });
  }

  const matchedAmount = candidates.reduce((sum, item) => sum + item.amount_zar, 0);
  return {
    dry_run: !apply,
    target_account_id: accountId,
    scanned: listed.length,
    matched: candidates.length,
    matched_amount_zar: Math.round(matchedAmount * 100) / 100,
    moved,
    moved_amount_zar: Math.round(movedAmount * 100) / 100,
    candidates,
    skipped_unmatched_undeposited: skippedUnmatched,
  };
}

export const HISTORICAL_RECEIPT_CLEANUP_CONFIRMATION = CONFIRMATION;
