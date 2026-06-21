/**
 * Full Zoho Books repair: voids previously linked invoices, clears DB links, and
 * re-syncs all bookings + monthly invoices with correct customer contacts and
 * short order numbers (BK-XXXXXXXX / MI-XXXXXXXX). Does NOT send customer emails.
 *
 * From `apps/web`:
 *   npm run repair:zoho-invoices              # dry-run
 *   npm run repair:zoho-invoices -- --apply   # void + clear + re-sync
 */

import { execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { voidZohoInvoice } from "../lib/zoho/zohoBooksService";
import { zohoBooksClient } from "../lib/zoho/zohoBooksClient";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;

const apply = process.argv.includes("--apply");
const UUID_REF = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ZohoInvoiceRow = {
  invoice_id: string;
  invoice_number?: string;
  reference_number?: string;
  status?: string;
};

type ZohoInvoiceListResponse = {
  invoices?: ZohoInvoiceRow[];
  page_context?: { has_more_page?: boolean };
};

async function collectLinkedZohoIds(admin: SupabaseClient): Promise<string[]> {
  const ids = new Set<string>();

  const { data: bookings } = await admin.from("bookings").select("zoho_invoice_id").not("zoho_invoice_id", "is", null);
  for (const row of bookings ?? []) {
    const id = String((row as { zoho_invoice_id?: string }).zoho_invoice_id ?? "").trim();
    if (id) ids.add(id);
  }

  const { data: monthly } = await admin
    .from("monthly_invoices")
    .select("zoho_invoice_id")
    .not("zoho_invoice_id", "is", null);
  for (const row of monthly ?? []) {
    const id = String((row as { zoho_invoice_id?: string }).zoho_invoice_id ?? "").trim();
    if (id) ids.add(id);
  }

  return [...ids];
}

async function listAllZohoInvoices(): Promise<ZohoInvoiceRow[]> {
  const all: ZohoInvoiceRow[] = [];
  let page = 1;
  for (;;) {
    const res = await zohoBooksClient.get<ZohoInvoiceListResponse>(
      `/invoices?page=${page}&per_page=200&sort_column=created_time&sort_order=D`,
    );
    all.push(...(res.invoices ?? []));
    if (!res.page_context?.has_more_page) break;
    page += 1;
  }
  return all;
}

async function voidInvoices(ids: string[], label: string): Promise<{ voided: number; failed: number }> {
  let voided = 0;
  let failed = 0;
  for (const id of ids) {
    const res = await voidZohoInvoice(id);
    if (res.ok) {
      voided += 1;
      console.log(`${label}: voided ${id}`);
    } else {
      failed += 1;
      console.log(`${label}: could not void ${id} — ${res.error}`);
    }
  }
  return { voided, failed };
}

async function clearAllZohoLinks(admin: SupabaseClient): Promise<{ bookings: number; monthly: number }> {
  const { data: bookingRows } = await admin.from("bookings").select("id").not("zoho_invoice_id", "is", null);
  for (const row of bookingRows ?? []) {
    await admin.from("bookings").update({ zoho_invoice_id: null }).eq("id", row.id);
  }

  const { data: monthlyRows } = await admin.from("monthly_invoices").select("id").not("zoho_invoice_id", "is", null);
  for (const row of monthlyRows ?? []) {
    await admin.from("monthly_invoices").update({ zoho_invoice_id: null }).eq("id", row.id);
  }

  return { bookings: bookingRows?.length ?? 0, monthly: monthlyRows?.length ?? 0 };
}

function runBackfills(): void {
  const webDir = path.dirname(fileURLToPath(import.meta.url)).replace(/scripts$/, "");
  const opts = { cwd: webDir, stdio: "inherit" as const, env: process.env };

  console.log("\n--- Re-syncing monthly invoices ---");
  execSync(
    "npm run backfill:zoho-monthly-invoices -- --apply --repair-all-contacts --include-drafts --month=2026-06",
    opts,
  );

  console.log("\n--- Re-syncing per-visit bookings ---");
  execSync("npm run backfill:zoho-invoices -- --apply --repair-all-contacts", opts);
}

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    console.error("Missing ZOHO_CLIENT_ID / ZOHO_REFRESH_TOKEN — Zoho sync is not configured.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });

  console.log(apply ? "Mode: APPLY (void + clear + re-sync)" : "Mode: DRY-RUN (no writes)");

  const linkedIds = await collectLinkedZohoIds(admin);
  console.log(`Linked Zoho invoice ids in DB: ${linkedIds.length}`);

  const allInvoices = await listAllZohoInvoices();
  const orphanUuidRefs = allInvoices
    .filter((inv) => {
      const ref = String(inv.reference_number ?? "").trim();
      return UUID_REF.test(ref) && !linkedIds.includes(inv.invoice_id);
    })
    .map((inv) => inv.invoice_id);

  console.log(`Zoho invoices with legacy full-UUID reference (orphans): ${orphanUuidRefs.length}`);

  const toVoid = [...new Set([...linkedIds, ...orphanUuidRefs])];
  console.log(`Total invoices to attempt void: ${toVoid.length}`);

  if (!apply) {
    console.log("[dry-run] would void linked + orphan invoices, clear DB links, run both backfills");
    return;
  }

  const voidResult = await voidInvoices(toVoid, "repair");
  console.log(`Void complete: voided=${voidResult.voided} failed=${voidResult.failed} (paid invoices often cannot void)`);

  const cleared = await clearAllZohoLinks(admin);
  console.log(`Cleared DB links: bookings=${cleared.bookings} monthly=${cleared.monthly}`);

  runBackfills();
  console.log("\nRepair finished.");
}

void main();
