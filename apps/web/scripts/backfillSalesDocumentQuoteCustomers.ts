/**
 * Backfill customer accounts for historical website quote requests missing `customer_id`.
 *
 * From `apps/web`:
 *   npm run backfill:sales-document-quote-customers           # dry-run
 *   npm run backfill:sales-document-quote-customers -- --apply
 */

import "./load-apps-web-env";

import { createClient } from "@supabase/supabase-js";

import { backfillSalesDocumentQuoteCustomers } from "@/lib/salesDocument/backfillSalesDocumentQuoteCustomers";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY;
const apply = process.argv.includes("--apply");

async function main() {
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    process.exit(1);
  }

  const admin = createClient(url, key, { auth: { persistSession: false } });
  console.log(apply ? "Mode: APPLY" : "Mode: DRY-RUN (pass --apply to write)");

  const result = await backfillSalesDocumentQuoteCustomers(admin, { apply });

  console.log(
    [
      `scanned=${result.scanned}`,
      `would_link=${result.linked}`,
      `created=${result.created}`,
      `reused=${result.reused}`,
      `skipped=${result.skipped}`,
      `failed=${result.failed}`,
    ].join(" "),
  );

  if (result.errors.length > 0) {
    console.log("\nFailures:");
    for (const err of result.errors) {
      console.log(`  ${err.documentId.slice(0, 8)}: ${err.error}`);
    }
  }

  if (!apply && result.linked > 0) {
    console.log(`\nRe-run with --apply to link ${result.linked} quote request(s) to customer accounts.`);
  }
}

void main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
