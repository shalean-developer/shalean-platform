/**
 * Backfill Zoho Books human-readable document numbers (INV-…, EST-…) for rows
 * that already have zoho_invoice_id / zoho_estimate_id but no mirrored number.
 *
 * From `apps/web`:
 *   npm run backfill:zoho-invoice-numbers                 # dry-run
 *   npm run backfill:zoho-invoice-numbers -- --apply      # write to DB
 *
 * Requires ZOHO_* and Supabase service-role env.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { getZohoEstimate, getZohoInvoice } from "../lib/zoho/zohoBooksService";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const ZOHO_THROTTLE_MS = 400;

type Counters = { scanned: number; updated: number; failed: number; skipped: number };

async function backfillBookings(admin: SupabaseClient): Promise<Counters> {
  const counters: Counters = { scanned: 0, updated: 0, failed: 0, skipped: 0 };
  const pageSize = 100;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("bookings")
      .select("id, zoho_invoice_id, zoho_invoice_number")
      .not("zoho_invoice_id", "is", null)
      .is("zoho_invoice_number", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    for (const row of rows) {
      counters.scanned += 1;
      const id = String(row.id ?? "");
      const zohoId = String(row.zoho_invoice_id ?? "").trim();
      if (!id || !zohoId) {
        counters.skipped += 1;
        continue;
      }

      const res = await getZohoInvoice(zohoId);
      if (!res.ok) {
        counters.failed += 1;
        console.error(`bookings ${id.slice(0, 8)}: fetch failed — ${res.error}`);
        await sleep(ZOHO_THROTTLE_MS);
        continue;
      }

      const number = res.invoiceNumber.trim();
      if (!number) {
        counters.skipped += 1;
        continue;
      }

      if (!apply) {
        console.log(`[dry-run] bookings ${id.slice(0, 8)}: ${number}`);
        counters.updated += 1;
        continue;
      }

      const { error: upErr } = await admin
        .from("bookings")
        .update({ zoho_invoice_number: number } as never)
        .eq("id", id)
        .is("zoho_invoice_number", null);

      if (upErr) {
        counters.failed += 1;
        console.error(`bookings ${id.slice(0, 8)}: update failed — ${upErr.message}`);
      } else {
        counters.updated += 1;
        console.log(`bookings ${id.slice(0, 8)}: stored ${number}`);
      }

      await sleep(ZOHO_THROTTLE_MS);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return counters;
}

async function backfillMonthlyInvoices(admin: SupabaseClient): Promise<Counters> {
  const counters: Counters = { scanned: 0, updated: 0, failed: 0, skipped: 0 };
  const pageSize = 100;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("monthly_invoices")
      .select("id, zoho_invoice_id, zoho_invoice_number")
      .not("zoho_invoice_id", "is", null)
      .is("zoho_invoice_number", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    for (const row of rows) {
      counters.scanned += 1;
      const id = String(row.id ?? "");
      const zohoId = String(row.zoho_invoice_id ?? "").trim();
      if (!id || !zohoId) {
        counters.skipped += 1;
        continue;
      }

      const res = await getZohoInvoice(zohoId);
      if (!res.ok) {
        counters.failed += 1;
        console.error(`monthly_invoices ${id.slice(0, 8)}: fetch failed — ${res.error}`);
        await sleep(ZOHO_THROTTLE_MS);
        continue;
      }

      const number = res.invoiceNumber.trim();
      if (!number) {
        counters.skipped += 1;
        continue;
      }

      if (!apply) {
        console.log(`[dry-run] monthly_invoices ${id.slice(0, 8)}: ${number}`);
        counters.updated += 1;
        continue;
      }

      const { error: upErr } = await admin
        .from("monthly_invoices")
        .update({ zoho_invoice_number: number } as never)
        .eq("id", id)
        .is("zoho_invoice_number", null);

      if (upErr) {
        counters.failed += 1;
        console.error(`monthly_invoices ${id.slice(0, 8)}: update failed — ${upErr.message}`);
      } else {
        counters.updated += 1;
        console.log(`monthly_invoices ${id.slice(0, 8)}: stored ${number}`);
      }

      await sleep(ZOHO_THROTTLE_MS);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return counters;
}

async function backfillSalesDocumentInvoices(admin: SupabaseClient): Promise<Counters> {
  const counters: Counters = { scanned: 0, updated: 0, failed: 0, skipped: 0 };
  const pageSize = 100;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("sales_documents")
      .select("id, document_type, zoho_invoice_id, zoho_invoice_number")
      .eq("document_type", "invoice")
      .not("zoho_invoice_id", "is", null)
      .is("zoho_invoice_number", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    for (const row of rows) {
      counters.scanned += 1;
      const id = String(row.id ?? "");
      const zohoId = String(row.zoho_invoice_id ?? "").trim();
      if (!id || !zohoId) {
        counters.skipped += 1;
        continue;
      }

      const res = await getZohoInvoice(zohoId);
      if (!res.ok) {
        counters.failed += 1;
        console.error(`sales_documents ${id.slice(0, 8)}: fetch failed — ${res.error}`);
        await sleep(ZOHO_THROTTLE_MS);
        continue;
      }

      const number = res.invoiceNumber.trim();
      if (!number) {
        counters.skipped += 1;
        continue;
      }

      if (!apply) {
        console.log(`[dry-run] sales_documents ${id.slice(0, 8)}: ${number}`);
        counters.updated += 1;
        continue;
      }

      const { error: upErr } = await admin
        .from("sales_documents")
        .update({ zoho_invoice_number: number } as never)
        .eq("id", id)
        .is("zoho_invoice_number", null);

      if (upErr) {
        counters.failed += 1;
        console.error(`sales_documents ${id.slice(0, 8)}: update failed — ${upErr.message}`);
      } else {
        counters.updated += 1;
        console.log(`sales_documents ${id.slice(0, 8)}: stored ${number}`);
      }

      await sleep(ZOHO_THROTTLE_MS);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return counters;
}

async function backfillSalesDocumentQuotes(admin: SupabaseClient): Promise<Counters> {
  const counters: Counters = { scanned: 0, updated: 0, failed: 0, skipped: 0 };
  const pageSize = 100;
  let from = 0;

  for (;;) {
    const { data, error } = await admin
      .from("sales_documents")
      .select("id, document_type, zoho_estimate_id, zoho_estimate_number")
      .eq("document_type", "quote")
      .not("zoho_estimate_id", "is", null)
      .is("zoho_estimate_number", null)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    if (rows.length === 0) break;

    for (const row of rows) {
      counters.scanned += 1;
      const id = String(row.id ?? "");
      const zohoId = String(row.zoho_estimate_id ?? "").trim();
      if (!id || !zohoId) {
        counters.skipped += 1;
        continue;
      }

      const res = await getZohoEstimate(zohoId);
      if (!res.ok) {
        counters.failed += 1;
        console.error(`sales_documents ${id.slice(0, 8)}: fetch failed — ${res.error}`);
        await sleep(ZOHO_THROTTLE_MS);
        continue;
      }

      const number = res.estimateNumber.trim();
      if (!number) {
        counters.skipped += 1;
        continue;
      }

      if (!apply) {
        console.log(`[dry-run] sales_documents ${id.slice(0, 8)}: ${number}`);
        counters.updated += 1;
        continue;
      }

      const { error: upErr } = await admin
        .from("sales_documents")
        .update({ zoho_estimate_number: number } as never)
        .eq("id", id)
        .is("zoho_estimate_number", null);

      if (upErr) {
        counters.failed += 1;
        console.error(`sales_documents ${id.slice(0, 8)}: update failed — ${upErr.message}`);
      } else {
        counters.updated += 1;
        console.log(`sales_documents ${id.slice(0, 8)}: stored ${number}`);
      }

      await sleep(ZOHO_THROTTLE_MS);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  return counters;
}

async function main() {
  if (!url || !key) {
    console.error("Missing Supabase env.");
    process.exit(1);
  }
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    console.error("Missing ZOHO_* env.");
    process.exit(1);
  }

  console.log(`Backfill Zoho document numbers${apply ? " (apply)" : " (dry-run)"}`);

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const booking = await backfillBookings(admin);
  console.log("bookings:", booking);

  const monthly = await backfillMonthlyInvoices(admin);
  console.log("monthly_invoices:", monthly);

  const salesInvoices = await backfillSalesDocumentInvoices(admin);
  console.log("sales_documents (invoices):", salesInvoices);

  const salesQuotes = await backfillSalesDocumentQuotes(admin);
  console.log("sales_documents (quotes):", salesQuotes);

  console.log("Done.");
}

void main();
