/**
 * OFFICE-BILLING-E2E-09 — bounded final Zoho invoice metadata cleanup.
 *
 * Targets exactly two known historical rows:
 * 1) monthly invoice 6356f9ea... — current Zoho link is valid; refresh stale
 *    accounting_invoice_sync metadata to the current invoice.
 * 2) booking f9cac40c... — historical Zoho invoice is confirmed missing and its
 *    Paystack transaction is already explicitly ignored for accounting replay;
 *    preserve the historical booking fields but mark invoice metadata ignored so
 *    periodic status polling no longer treats it as a live Zoho failure.
 *
 * Dry-run by default. Apply requires:
 *   --apply --confirm=OFFICE-BILLING-E2E-09
 *
 * No customer email is sent. No Paystack charge/payment is created. No Zoho
 * invoice or payment is created, updated, or deleted.
 */

import { createClient } from "@supabase/supabase-js";

import {
  getZohoInvoice,
  zohoInvoiceExists,
} from "../lib/zoho/zohoBooksService";
import { upsertInvoiceSyncMetadata } from "../lib/accounting/syncInvoiceMetadata";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-09";

const MONTHLY_ID = "6356f9ea-c836-4bfa-a798-9a0e948e39b7";
const MONTHLY_ZOHO_ID = "253016000001589114";
const MONTHLY_ZOHO_NUMBER = "INV-001923";

const BOOKING_ID = "f9cac40c-0698-41dd-ac6d-6d923eaa854f";
const BOOKING_OLD_ZOHO_ID = "253016000000688016";
const BOOKING_OLD_ZOHO_NUMBER = "INV-001776";
const HISTORICAL_IGNORE_REASON =
  "accounting_not_applicable:zoho_invoice_missing_historical_paid";

function fail(message: string): never {
  console.error(`PRECHECK_FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const apply = process.argv.includes("--apply");
  const confirmArg = process.argv
    .find((arg) => arg.startsWith("--confirm="))
    ?.slice("--confirm=".length);

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) {
    fail(`refusing non-production Supabase URL: ${url}`);
  }
  if (
    !process.env.ZOHO_CLIENT_ID ||
    !process.env.ZOHO_REFRESH_TOKEN ||
    !process.env.ZOHO_ORGANIZATION_ID
  ) {
    fail("missing Zoho configuration");
  }
  if (apply && confirmArg !== CONFIRM) {
    fail(`apply requires --confirm=${CONFIRM}`);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const [{ data: monthly, error: monthlyError }, { data: booking, error: bookingError }] =
    await Promise.all([
      admin
        .from("monthly_invoices")
        .select(
          "id,status,total_amount_cents,amount_paid_cents,balance_cents,zoho_invoice_id,zoho_invoice_number",
        )
        .eq("id", MONTHLY_ID)
        .maybeSingle(),
      admin
        .from("bookings")
        .select(
          "id,status,payment_status,total_paid_zar,amount_paid_cents,zoho_invoice_id,zoho_invoice_number",
        )
        .eq("id", BOOKING_ID)
        .maybeSingle(),
    ]);

  if (monthlyError || !monthly) fail(`monthly lookup failed: ${monthlyError?.message ?? "not_found"}`);
  if (bookingError || !booking) fail(`booking lookup failed: ${bookingError?.message ?? "not_found"}`);

  if (String(monthly.status ?? "").toLowerCase() !== "paid") fail("monthly invoice no longer paid");
  if (String(monthly.zoho_invoice_id ?? "") !== MONTHLY_ZOHO_ID) {
    fail(`monthly Zoho id changed: ${monthly.zoho_invoice_id}`);
  }
  if (String(monthly.zoho_invoice_number ?? "") !== MONTHLY_ZOHO_NUMBER) {
    fail(`monthly Zoho number changed: ${monthly.zoho_invoice_number}`);
  }
  if (Math.round(Number(monthly.balance_cents ?? 0)) !== 0) fail("monthly balance is no longer zero");
  if (
    Math.round(Number(monthly.total_amount_cents ?? 0)) !==
    Math.round(Number(monthly.amount_paid_cents ?? 0))
  ) {
    fail("monthly paid/total mismatch");
  }

  if (String(booking.status ?? "").toLowerCase() !== "completed") fail("booking no longer completed");
  if (String(booking.payment_status ?? "").toLowerCase() !== "success") fail("booking no longer paid");
  if (String(booking.zoho_invoice_id ?? "") !== BOOKING_OLD_ZOHO_ID) {
    fail(`booking historical Zoho id changed: ${booking.zoho_invoice_id}`);
  }
  if (String(booking.zoho_invoice_number ?? "") !== BOOKING_OLD_ZOHO_NUMBER) {
    fail(`booking historical Zoho number changed: ${booking.zoho_invoice_number}`);
  }

  const { data: bookingPayments, error: bookingPaymentError } = await admin
    .from("payment_transactions")
    .select("id,gateway,amount_cents,paid_at,sync_status,sync_errors,external_accounting_id")
    .eq("entity_type", "booking")
    .eq("entity_id", BOOKING_ID);

  if (bookingPaymentError) fail(`booking payment lookup failed: ${bookingPaymentError.message}`);
  if ((bookingPayments ?? []).length !== 1) {
    fail(`expected exactly one booking payment transaction; found ${bookingPayments?.length ?? 0}`);
  }
  const bookingPayment = bookingPayments![0]!;
  if (String(bookingPayment.gateway ?? "").toLowerCase() !== "paystack") fail("booking payment is not Paystack");
  if (String(bookingPayment.sync_status ?? "") !== "ignored") fail("booking payment is not intentionally ignored");
  if (String(bookingPayment.sync_errors ?? "") !== HISTORICAL_IGNORE_REASON) {
    fail(`booking payment ignore reason changed: ${bookingPayment.sync_errors}`);
  }
  if (String(bookingPayment.external_accounting_id ?? "").trim()) {
    fail("booking payment unexpectedly has external accounting id");
  }

  const [monthlyZoho, bookingOldExists] = await Promise.all([
    getZohoInvoice(MONTHLY_ZOHO_ID),
    zohoInvoiceExists(BOOKING_OLD_ZOHO_ID),
  ]);

  if (!monthlyZoho.ok) fail(`current monthly Zoho invoice lookup failed: ${monthlyZoho.error}`);
  if (String(monthlyZoho.invoiceNumber ?? "") !== MONTHLY_ZOHO_NUMBER) {
    fail(`current monthly Zoho invoice number mismatch: ${monthlyZoho.invoiceNumber}`);
  }
  if (bookingOldExists === "unknown") fail("historical booking Zoho lookup was inconclusive");
  if (bookingOldExists) fail("historical booking Zoho invoice unexpectedly exists again");

  console.log("OFFICE_BILLING_E2E_09_PRECHECK_PASS");
  console.log(`MONTHLY_CURRENT_ZOHO=${MONTHLY_ZOHO_NUMBER}:${MONTHLY_ZOHO_ID}`);
  console.log(`BOOKING_HISTORICAL_ZOHO_MISSING=${BOOKING_OLD_ZOHO_NUMBER}:${BOOKING_OLD_ZOHO_ID}`);
  console.log(`MODE=${apply ? "APPLY" : "DRY_RUN"}`);

  if (!apply) {
    console.log("DRY_RUN_COMPLETE");
    return;
  }

  await upsertInvoiceSyncMetadata(admin, {
    entityType: "monthly_invoice",
    entityId: MONTHLY_ID,
    zohoInvoiceId: monthlyZoho.zohoInvoiceId,
    zohoInvoiceNumber: monthlyZoho.invoiceNumber,
    zohoCustomerId: monthlyZoho.customerId,
    invoiceStatus: monthlyZoho.status,
    invoiceTotalCents: monthlyZoho.totalCents,
    taxAmountCents: monthlyZoho.taxCents,
    outstandingBalanceCents: monthlyZoho.balanceCents,
    syncStatus: "synced",
    syncErrors: null,
  });

  const now = new Date().toISOString();
  const { error: ignoredError } = await admin
    .from("accounting_invoice_sync")
    .upsert(
      {
        entity_type: "booking",
        entity_id: BOOKING_ID,
        booking_id: BOOKING_ID,
        zoho_invoice_id: BOOKING_OLD_ZOHO_ID,
        zoho_invoice_number: BOOKING_OLD_ZOHO_NUMBER,
        invoice_status: "historical_missing",
        invoice_total_cents: Math.round(
          Number(booking.amount_paid_cents ?? Number(booking.total_paid_zar ?? 0) * 100),
        ),
        outstanding_balance_cents: 0,
        currency_code: "ZAR",
        sync_status: "ignored",
        sync_errors: HISTORICAL_IGNORE_REASON,
        last_synced_at: now,
        updated_at: now,
      },
      { onConflict: "entity_type,entity_id" },
    );

  if (ignoredError) fail(`booking ignored metadata upsert failed: ${ignoredError.message}`);

  console.log("OFFICE_BILLING_E2E_09_APPLY_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
