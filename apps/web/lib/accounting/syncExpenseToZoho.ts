import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createZohoExpense,
  getOrCreateVendor,
  listZohoExpenseAccounts,
} from "@/lib/zoho/zohoBooksService";
import {
  loadZohoIntegrationSettings,
  resolveZohoAccountNameForCategory,
} from "@/lib/accounting/zohoIntegrationSettings";
import { logSystemEvent } from "@/lib/logging/systemLog";

type ExpenseRow = {
  id: string;
  expense_date: string;
  amount_cents: number;
  description: string | null;
  notes: string | null;
  booking_id: string | null;
  payment_transaction_id: string | null;
  external_accounting_id: string | null;
  sync_status: string;
  vendor_id: string | null;
  expense_categories: { name: string } | null;
  expense_vendors: { name: string; external_accounting_id: string | null } | null;
  payment_transactions: { gateway_reference: string } | null;
};

let _zohoAccountCache: Map<string, string> | null = null;
let _zohoAccountCacheAt = 0;

async function resolveZohoAccountId(accountName: string): Promise<string | null> {
  const now = Date.now();
  if (!_zohoAccountCache || now - _zohoAccountCacheAt > 300_000) {
    const res = await listZohoExpenseAccounts();
    _zohoAccountCache = new Map();
    if (res.ok) {
      for (const a of res.accounts) {
        _zohoAccountCache.set(a.accountName.toLowerCase(), a.accountId);
      }
    }
    _zohoAccountCacheAt = now;
  }
  return _zohoAccountCache.get(accountName.toLowerCase()) ?? null;
}

async function resolveInvoiceNumberForExpense(
  admin: SupabaseClient,
  expense: ExpenseRow,
): Promise<string | null> {
  if (!expense.booking_id) return null;
  const { data } = await admin
    .from("bookings")
    .select("zoho_invoice_number")
    .eq("id", expense.booking_id)
    .maybeSingle();
  return data?.zoho_invoice_number ?? null;
}

/**
 * Push a single approved expense to Zoho Books. Idempotent — skips if already synced.
 */
export async function syncExpenseToZoho(
  admin: SupabaseClient,
  expenseId: string,
): Promise<{ ok: true; zohoExpenseId: string } | { ok: false; error: string }> {
  const { data: expense } = await admin
    .from("expenses")
    .select(
      "id, expense_date, amount_cents, description, notes, booking_id, payment_transaction_id, external_accounting_id, sync_status, vendor_id, expense_categories ( name ), expense_vendors ( name, external_accounting_id ), payment_transactions ( gateway_reference )",
    )
    .eq("id", expenseId)
    .maybeSingle();

  if (!expense) return { ok: false, error: "expense_not_found" };
  const row = expense as unknown as ExpenseRow;

  if (row.external_accounting_id && row.sync_status === "synced") {
    return { ok: true, zohoExpenseId: row.external_accounting_id };
  }

  if (row.amount_cents <= 0) return { ok: false, error: "invalid_amount" };

  const settings = await loadZohoIntegrationSettings(admin);
  const categoryName = row.expense_categories?.name ?? "Other";
  const zohoAccountName = resolveZohoAccountNameForCategory(
    categoryName,
    settings.expense_category_mappings,
  );
  const accountId = await resolveZohoAccountId(zohoAccountName);
  if (!accountId) return { ok: false, error: `zoho_account_not_found:${zohoAccountName}` };

  let vendorZohoId = row.expense_vendors?.external_accounting_id ?? null;
  const vendorName = row.expense_vendors?.name ?? "Paystack";
  if (!vendorZohoId && vendorName) {
    const vr = await getOrCreateVendor({ name: vendorName });
    if (vr.ok) vendorZohoId = vr.vendorId;
  }

  const invoiceNumber = await resolveInvoiceNumberForExpense(admin, row);
  const paystackRef = row.payment_transactions?.gateway_reference ?? null;
  const description =
    invoiceNumber && categoryName === "Paystack Fees"
      ? `Processing fee for Invoice ${invoiceNumber}`
      : row.description ?? `Expense ${expenseId.slice(0, 8)}`;

  const res = await createZohoExpense({
    accountId,
    date: row.expense_date,
    amountZar: row.amount_cents / 100,
    vendorId: vendorZohoId ?? undefined,
    description,
    referenceNumber: paystackRef ?? undefined,
    currencyCode: "ZAR",
  });

  if (!res.ok) return { ok: false, error: res.error };

  const now = new Date().toISOString();
  await admin
    .from("expenses")
    .update({
      external_accounting_id: res.expenseId,
      sync_status: "synced",
      last_synced_at: now,
      sync_errors: null,
    })
    .eq("id", expenseId);

  await logSystemEvent({
    level: "info",
    source: "accounting/syncExpenseToZoho",
    message: "expense_synced_to_zoho",
    context: { expense_id: expenseId, zoho_expense_id: res.expenseId },
  });

  return { ok: true, zohoExpenseId: res.expenseId };
}
