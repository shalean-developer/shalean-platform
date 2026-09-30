/**
 * OFFICE-BILLING-E2E-04B — bounded recreation of 20 historical paid monthly
 * invoices that are confirmed missing from Zoho Books.
 *
 * Dry-run by default. Apply requires:
 *   --apply --confirm=OFFICE-BILLING-E2E-04B
 *
 * Preconditions:
 * - production Supabase only
 * - exact frozen 20 monthly invoice ids
 * - every row remains paid with no zoho_invoice_id
 * - exactly one local Paystack payment transaction per row
 * - transaction amount equals invoice total
 * - no current Zoho match by historical invoice number or MI-XXXXXXXX reference
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { zohoBooksClient } from "../lib/zoho/zohoBooksClient";
import { formatZohoOrderReference } from "../lib/zoho/zohoOrderReference";

const PROD_REF = "paqjwfulwywtsyyvdxrq";
const CONFIRM = "OFFICE-BILLING-E2E-04B";

const TARGET_IDS = [
  "1b3ceaad-6e2a-428b-a3a7-08402414814c",
  "de20361c-9d08-444f-98b8-da9adc674fc9",
  "f256dc70-e775-4079-9cb9-782ccaff8769",
  "6e7326a4-85fc-4c0a-988d-b631eebe6177",
  "ac53de5e-a83b-4cca-b9a8-0f830caa2319",
  "7a1dfcf9-5c47-48d6-b194-f8beb62e5c5e",
  "f2b94630-8f0c-45fa-89b5-f3b5681d4604",
  "777880e9-e88e-43b9-aa8a-f1ee1408828b",
  "4c5b3913-bac7-44b4-905c-9367efa5f459",
  "4b0ff338-5b9a-4e5e-9d80-f1b871ada222",
  "2aa68161-412f-4bad-a219-b56c6ceb86fd",
  "5afee990-0a33-445d-a514-4d91c48494b3",
  "41e1797c-e110-4350-a252-68e073432eea",
  "0ced9c6c-51e3-4125-a3b6-6b2ca384f4cd",
  "6356f9ea-c836-4bfa-a798-9a0e948e39b7",
  "69cae57e-14e6-42fb-8969-3f7764e8882c",
  "2a81cfd4-bff1-4f33-a36f-045849095ae4",
  "cb9760bf-8008-4e8a-a8b9-09297980bc10",
  "f024b3e5-0959-4276-81cd-d7c4ba17d91d",
  "f4848609-9d89-412c-896c-538f5617a0dc",
] as const;

type LocalInvoice = {
  id: string;
  status: string | null;
  total_amount_cents: number | null;
  amount_paid_cents: number | null;
  zoho_invoice_id: string | null;
  zoho_invoice_number: string | null;
};

type ZohoInvoice = {
  invoice_id: string;
  invoice_number?: string;
  reference_number?: string;
};

type ZohoList = {
  invoices?: ZohoInvoice[];
  page_context?: { has_more_page?: boolean };
};

function fail(message: string): never {
  console.error(`PRECHECK_FAIL: ${message}`);
  process.exit(1);
}

async function listAllZohoInvoices(): Promise<ZohoInvoice[]> {
  const all: ZohoInvoice[] = [];
  let page = 1;
  for (;;) {
    const res = await zohoBooksClient.get<ZohoList>(
      `/invoices?page=${page}&per_page=200&sort_column=created_time&sort_order=D`,
    );
    all.push(...(res.invoices ?? []));
    if (!res.page_context?.has_more_page) return all;
    page += 1;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  const apply = process.argv.includes("--apply");
  const confirmArg = process.argv.find((arg) => arg.startsWith("--confirm="))?.slice("--confirm=".length);

  if (!url || !key) fail("missing Supabase service environment");
  if (!url.includes(`${PROD_REF}.supabase.co`)) fail(`refusing non-production Supabase URL: ${url}`);
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN || !process.env.ZOHO_ORGANIZATION_ID) {
    fail("missing Zoho configuration");
  }
  if (apply && confirmArg !== CONFIRM) fail(`apply requires --confirm=${CONFIRM}`);

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: invoiceData, error: invoiceError } = await admin
    .from("monthly_invoices")
    .select("id, status, total_amount_cents, amount_paid_cents, zoho_invoice_id, zoho_invoice_number")
    .in("id", [...TARGET_IDS]);

  if (invoiceError) fail(`invoice query failed: ${invoiceError.message}`);
  const invoices = (invoiceData ?? []) as LocalInvoice[];
  if (invoices.length !== TARGET_IDS.length) fail(`expected 20 monthly invoices; found ${invoices.length}`);

  const byId = new Map(invoices.map((row) => [row.id, row]));
  for (const id of TARGET_IDS) {
    const row = byId.get(id);
    if (!row) fail(`missing monthly invoice ${id}`);
    if (String(row.status ?? "").toLowerCase() !== "paid") fail(`${id} status=${row.status}`);
    if (String(row.zoho_invoice_id ?? "").trim()) fail(`${id} already linked to Zoho ${row.zoho_invoice_id}`);

    const total = Math.round(Number(row.total_amount_cents ?? 0));
    const paid = Math.round(Number(row.amount_paid_cents ?? 0));
    if (!(total > 0) || paid !== total) fail(`${id} paid/total mismatch paid=${paid} total=${total}`);
  }

  const { data: txData, error: txError } = await admin
    .from("payment_transactions")
    .select("entity_id, gateway, gateway_reference, amount_cents, external_accounting_id, sync_status")
    .eq("entity_type", "monthly_invoice")
    .in("entity_id", [...TARGET_IDS]);

  if (txError) fail(`payment transaction query failed: ${txError.message}`);

  const txById = new Map<string, typeof txData>();
  for (const tx of txData ?? []) {
    const keyId = String(tx.entity_id);
    txById.set(keyId, [...(txById.get(keyId) ?? []), tx]);
  }

  for (const id of TARGET_IDS) {
    const row = byId.get(id)!;
    const txs = txById.get(id) ?? [];
    if (txs.length !== 1) fail(`${id} expected exactly 1 payment transaction; found ${txs.length}`);

    const tx = txs[0]!;
    if (String(tx.gateway ?? "").toLowerCase() !== "paystack") fail(`${id} gateway=${tx.gateway}`);
    if (Math.round(Number(tx.amount_cents ?? 0)) !== Math.round(Number(row.total_amount_cents ?? 0))) {
      fail(`${id} transaction amount mismatch`);
    }
    if (String(tx.external_accounting_id ?? "").trim()) {
      fail(`${id} payment transaction already has external_accounting_id=${tx.external_accounting_id}`);
    }
  }

  const zoho = await listAllZohoInvoices();
  const byNumber = new Map<string, ZohoInvoice[]>();
  const byRef = new Map<string, ZohoInvoice[]>();
  for (const inv of zoho) {
    const number = String(inv.invoice_number ?? "").trim().toUpperCase();
    const ref = String(inv.reference_number ?? "").trim().toUpperCase();
    if (number) byNumber.set(number, [...(byNumber.get(number) ?? []), inv]);
    if (ref) byRef.set(ref, [...(byRef.get(ref) ?? []), inv]);
  }

  for (const id of TARGET_IDS) {
    const row = byId.get(id)!;
    const historicalNumber = String(row.zoho_invoice_number ?? "").trim().toUpperCase();
    const expectedRef = formatZohoOrderReference(id, "monthly").toUpperCase();

    if (historicalNumber && (byNumber.get(historicalNumber)?.length ?? 0) > 0) {
      fail(`${id} historical Zoho invoice number ${historicalNumber} now exists`);
    }
    if ((byRef.get(expectedRef)?.length ?? 0) > 0) {
      fail(`${id} Zoho reference ${expectedRef} now exists`);
    }
  }

  console.log(`PRECHECK_PASS targets=${TARGET_IDS.length} paid=20 local_payments=20 zoho_matches=0`);
  console.log(apply ? "MODE=APPLY" : "MODE=DRY_RUN");

  const webDir = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]scripts$/, "");
  const opts = { cwd: webDir, stdio: "inherit" as const, env: process.env };
  const applyFlag = apply ? " --apply" : "";

  execSync(
    `npx tsx --conditions=react-server scripts/backfillZohoMonthlyInvoices.ts --use-payment-transaction --ids=${TARGET_IDS.join(",")}${applyFlag}`,
    opts,
  );

  console.log(apply ? "OFFICE_BILLING_E2E_04B_APPLY_COMPLETE" : "OFFICE_BILLING_E2E_04B_DRY_RUN_COMPLETE");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
