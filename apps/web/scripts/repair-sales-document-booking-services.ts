/**
 * Repair service_slug on sales-document bookings (admin quotes with custom line items).
 *
 *   npx tsx scripts/repair-sales-document-booking-services.ts           # dry-run
 *   npx tsx scripts/repair-sales-document-booking-services.ts --apply  # persist
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

import { repairSalesDocumentBookingServiceSlug } from "../lib/salesDocument/repairSalesDocumentBookingServiceSlug";
import { resolveSalesDocumentBookingServiceSlug } from "../lib/salesDocument/resolveSalesDocumentBookingServiceSlug";
import type { SalesDocumentLineItem } from "../lib/salesDocument/types";

const __dir = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(resolve(__dir, "../.env.local"), "utf8");
for (const line of raw.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq <= 0) continue;
  const k = t.slice(0, eq).trim();
  let v = t.slice(eq + 1).trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  process.env[k] = v;
}

const apply = process.argv.includes("--apply");

const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function parseLineItems(raw: unknown): SalesDocumentLineItem[] {
  if (!Array.isArray(raw)) return [];
  return raw as SalesDocumentLineItem[];
}

async function loadSalesDocumentContext(salesDocumentId: string) {
  const { data: doc } = await admin
    .from("sales_documents")
    .select("line_items, request_details, converted_from_id")
    .eq("id", salesDocumentId)
    .maybeSingle();
  if (!doc) return null;

  let requestDetails = doc.request_details ?? null;
  let lineItems = parseLineItems(doc.line_items);
  const convertedFrom = String(doc.converted_from_id ?? "").trim();
  if (convertedFrom) {
    const { data: quote } = await admin
      .from("sales_documents")
      .select("line_items, request_details")
      .eq("id", convertedFrom)
      .maybeSingle();
    if (quote) {
      if (!requestDetails) requestDetails = quote.request_details ?? null;
      if (!lineItems.length) lineItems = parseLineItems(quote.line_items);
    }
  }
  return { requestDetails, lineItems };
}

async function main() {
  const { data: bookings, error } = await admin
    .from("bookings")
    .select("id, customer_name, service_slug, sales_document_id")
    .not("sales_document_id", "is", null);

  if (error) {
    console.error(error.message);
    process.exit(1);
  }

  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;
  let failed = 0;

  for (const booking of bookings ?? []) {
    scanned++;
    const salesDocumentId = String(booking.sales_document_id ?? "").trim();
    if (!salesDocumentId) continue;

    const ctx = await loadSalesDocumentContext(salesDocumentId);
    if (!ctx) continue;

    const inferred = resolveSalesDocumentBookingServiceSlug(ctx);
    const previous = String(booking.service_slug ?? "standard").trim() || "standard";
    if (previous === inferred) continue;

    wouldUpdate++;
    const label = `${booking.customer_name} ${String(booking.id).slice(0, 8)}: ${previous} → ${inferred}`;
    if (!apply) {
      console.log(`WOULD UPDATE ${label}`);
      continue;
    }

    const result = await repairSalesDocumentBookingServiceSlug(admin, booking.id);
    if (!result.ok) {
      failed++;
      console.error(`FAILED ${label}:`, result.error);
    } else if (result.updated) {
      updated++;
      console.log(`UPDATED ${label}`);
    }
  }

  console.log(`\nScanned ${scanned}. ${apply ? `Updated ${updated}` : `Would update ${wouldUpdate}`}. Failed ${failed}.`);
  if (!apply && wouldUpdate > 0) console.log("Re-run with --apply to persist.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
