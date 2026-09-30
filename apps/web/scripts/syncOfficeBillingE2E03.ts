/**
 * OFFICE-BILLING-E2E-03 — one-time bounded reconciliation of the verified
 * finalized Zoho backlog. Dry-run by default.
 *
 * Apply requires both:
 *   --apply --confirm=OFFICE-BILLING-E2E-03
 *
 * This operation is intentionally frozen to 2 completed paid bookings and
 * 11 finalized monthly invoices. Draft monthly invoices are never eligible.
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { zohoBooksClient } from "../lib/zoho/zohoBooksClient";
import { formatZohoOrderReference } from "../lib/zoho/zohoOrderReference";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-03";

const BOOKING_IDS = [
  "c1bd1fc8-03e9-4f2c-a597-e0ac395c841a",
  "da35fe22-6c69-42ad-9e39-8c8b46f11a7c",
] as const;

const MONTHLY_IDS = [
  "8b63a51d-480d-4e09-a3a0-fc13b216d957",
  "9d731483-a3cc-494d-8689-b750dbb88ac3",
  "0294abc6-b53d-430c-ac95-5e70a9b2f9f3",
  "4681a55d-a2b6-4fe3-b53a-96ae68fcd5a6",
  "4e4c370e-67dd-43dc-b28b-7f34fb33f0ad",
  "71f9295b-e655-404e-9d59-2aaf045eed07",
  "8e249c31-48fd-42ba-a17b-b62097545e3c",
  "b4c01032-3b1b-483e-b8bb-86dbd4d3156e",
  "ce1fe28d-085f-4ee6-acfe-dd2fbedea98d",
  "d86549b5-e342-45b3-87d4-07d737e5bf67",
  "eb31becd-0873-403b-80e0-250a2648ca69",
] as const;

type ZohoInvoice = {
  invoice_id: string;
  invoice_number?: string;
  reference_number?: string;
};

async function listAllZohoInvoices(): Promise<ZohoInvoice[]> {
  const all: ZohoInvoice[] = [];
  let page = 1;
  for (;;) {
    const res = await zohoBooksClient.get<{
      invoices?: ZohoInvoice[];
      page_context?: { has_more_page?: boolean };
    }>(`/invoices?page=${page}&per_page=200&sort_column=created_time&sort_order=D`);
    all.push(...(res.invoices ?? []));
    if (!res.page_context?.has_more_page) return all;
    page += 1;
  }
}

function fail(message: string): never {
  console.error(`PRECHECK_FAIL: ${message}`);
  process.exit(1);
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const apply = process.argv.includes("--apply");
  const confirmArg = process.argv.find((a) => a.startsWith("--confirm="))?.slice("--confirm=".length);

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail(`refusing non-production Supabase URL: ${url}`);
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORGANIZATION_ID) {
    fail("missing Zoho configuration");
  }
  if (apply && confirmArg !== CONFIRM) {
    fail(`apply requires --confirm=${CONFIRM}`);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: bookings, error: bookingError } = await admin
    .from("bookings")
    .select("id, status, is_test, payment_status, payment_completed_at, is_monthly_billing_booking, sales_document_id, payment_method, zoho_invoice_id, amount_paid_cents, total_paid_zar")
    .in("id", [...BOOKING_IDS]);
  if (bookingError) fail(`booking preflight query failed: ${bookingError.message}`);
  if ((bookings ?? []).length !== BOOKING_IDS.length) fail(`expected 2 booking rows; found ${bookings?.length ?? 0}`);

  for (const row of bookings ?? []) {
    if (row.is_test === true) fail(`booking ${row.id} became test`);
    if (String(row.status ?? "").toLowerCase() !== "completed") fail(`booking ${row.id} status=${row.status}`);
    if (!row.payment_completed_at) fail(`booking ${row.id} no longer has payment_completed_at`);
    if (row.is_monthly_billing_booking === true) fail(`booking ${row.id} became monthly-owned`);
    if (String(row.sales_document_id ?? "").trim()) fail(`booking ${row.id} now belongs to sales document ${row.sales_document_id}`);
    if (String(row.payment_method ?? "").toLowerCase() === "zoho") fail(`booking ${row.id} now has Zoho payment ownership`);
    if (String(row.zoho_invoice_id ?? "").trim()) fail(`booking ${row.id} already linked to Zoho ${row.zoho_invoice_id}`);
    const cents = Number(row.amount_paid_cents ?? Math.round(Number(row.total_paid_zar ?? 0) * 100));
    if (!(cents > 0)) fail(`booking ${row.id} is not positively paid`);
  }

  const { data: monthly, error: monthlyError } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, amount_paid_cents, zoho_invoice_id")
    .in("id", [...MONTHLY_IDS]);
  if (monthlyError) fail(`monthly preflight query failed: ${monthlyError.message}`);
  if ((monthly ?? []).length !== MONTHLY_IDS.length) fail(`expected 11 monthly rows; found ${monthly?.length ?? 0}`);

  let sent = 0;
  let paid = 0;
  for (const row of monthly ?? []) {
    const status = String(row.status ?? "").toLowerCase();
    if (status === "draft") fail(`monthly ${row.id} is draft; drafts are forbidden`);
    if (status === "sent") sent += 1;
    else if (status === "paid") paid += 1;
    else fail(`monthly ${row.id} status=${row.status}; expected sent/paid`);
    if (!(Number(row.total_amount_cents ?? 0) > 0)) fail(`monthly ${row.id} has non-positive total`);
    if (String(row.zoho_invoice_id ?? "").trim()) fail(`monthly ${row.id} already linked to Zoho ${row.zoho_invoice_id}`);
  }
  if (sent !== 9 || paid !== 2) fail(`expected sent=9 paid=2; found sent=${sent} paid=${paid}`);

  const zoho = await listAllZohoInvoices();
  const byReference = new Map(
    zoho.map((invoice) => [String(invoice.reference_number ?? "").trim().toUpperCase(), invoice]),
  );
  for (const id of BOOKING_IDS) {
    const ref = formatZohoOrderReference(id, "booking");
    const existing = byReference.get(ref);
    if (existing) fail(`Zoho already contains ${ref} as ${existing.invoice_number ?? existing.invoice_id}`);
  }
  for (const id of MONTHLY_IDS) {
    const ref = formatZohoOrderReference(id, "monthly");
    const existing = byReference.get(ref);
    if (existing) fail(`Zoho already contains ${ref} as ${existing.invoice_number ?? existing.invoice_id}`);
  }

  console.log(`PRECHECK_PASS bookings=${BOOKING_IDS.length} monthly=${MONTHLY_IDS.length} sent=${sent} paid=${paid} drafts=0`);
  console.log(apply ? "MODE=APPLY" : "MODE=DRY_RUN");

  const webDir = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "");
  const opts = { cwd: webDir, stdio: "inherit" as const, env: process.env };
  const applyFlag = apply ? " --apply" : "";

  // Invoke tsx directly so child processes inherit this wrapper's already-validated
  // production environment. Do not use package.json backfill scripts here: those
  // intentionally load .env.local and can silently switch a bounded production run
  // to a developer/staging project.
  execSync(
    `npx tsx --conditions=react-server scripts/backfillZohoInvoices.ts --ids=${BOOKING_IDS.join(",")}${applyFlag}`,
    opts,
  );
  execSync(
    `npx tsx --conditions=react-server scripts/backfillZohoMonthlyInvoices.ts --ids=${MONTHLY_IDS.join(",")}${applyFlag}`,
    opts,
  );

  console.log(apply ? "OFFICE_BILLING_E2E_03_APPLY_COMPLETE" : "OFFICE_BILLING_E2E_03_DRY_RUN_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
