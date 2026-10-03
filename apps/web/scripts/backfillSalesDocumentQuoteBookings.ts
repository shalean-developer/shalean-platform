/**
 * Backfill bookings for historical quote → invoice conversions missing linked bookings.
 *
 * From `apps/web`:
 *   npm run backfill:sales-document-quote-bookings           # dry-run
 *   npm run backfill:sales-document-quote-bookings -- --apply
 */

import "./load-apps-web-env";

import { createClient } from "@supabase/supabase-js";

import { backfillSalesDocumentQuoteBookings } from "@/lib/salesDocument/backfillSalesDocumentQuoteBookings";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");

function readInvoiceIds(argv: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg.startsWith("--invoice-id=")) {
      const value = arg.slice("--invoice-id=".length).trim();
      if (value) out.push(value);
      continue;
    }
    if (arg === "--invoice-id") {
      const value = String(argv[i + 1] ?? "").trim();
      if (value) out.push(value);
      i += 1;
    }
  }
  return [...new Set(out)];
}

const invoiceIds = readInvoiceIds(process.argv.slice(2));

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN (pass --apply to write)");
  if (invoiceIds.length > 0) {
    console.log(`Invoice scope: ${invoiceIds.join(",")}`);
  }

  const result = await backfillSalesDocumentQuoteBookings(admin, { apply, invoiceIds });

  console.log(
    [
      `scanned=${result.scanned}`,
      apply ? `created=${result.created}` : `would_create=${result.created}`,
      `already_existed=${result.alreadyExisted}`,
      `payment_synced=${result.paymentSynced}`,
      `skipped=${result.skipped}`,
      `failed=${result.failed}`,
    ].join(" "),
  );

  if (result.errors.length > 0) {
    console.log("\nFailures:");
    for (const err of result.errors) {
      console.log(`  invoice ${err.invoiceId.slice(0, 8)} (quote ${err.quoteId.slice(0, 8)}): ${err.error}`);
    }
  }

  if (!apply && result.created > 0) {
    console.log(`\nRe-run with --apply to create ${result.created} booking(s).`);
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
