import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { logSystemEvent } from "@/lib/logging/systemLog";
import { ensureSalesDocumentCustomer } from "@/lib/salesDocument/ensureSalesDocumentCustomer";

export type BackfillSalesDocumentQuoteCustomersOptions = {
  /** When false, only report what would change. Default true for scripts with --apply. */
  apply?: boolean;
  /** Max documents per batch (pagination). */
  batchSize?: number;
};

export type BackfillSalesDocumentQuoteCustomersResult = {
  scanned: number;
  linked: number;
  created: number;
  reused: number;
  skipped: number;
  failed: number;
  errors: Array<{ documentId: string; error: string }>;
};

async function propagateCustomerIdToRelatedDocuments(
  admin: SupabaseClient,
  quoteId: string,
  customerId: string,
): Promise<void> {
  await admin
    .from("sales_documents")
    .update({ customer_id: customerId })
    .eq("converted_from_id", quoteId)
    .is("customer_id", null);
}

/**
 * Backfill customer accounts for historical website quote requests missing `customer_id`.
 */
export async function backfillSalesDocumentQuoteCustomers(
  admin: SupabaseClient,
  opts: BackfillSalesDocumentQuoteCustomersOptions = {},
): Promise<BackfillSalesDocumentQuoteCustomersResult> {
  const apply = opts.apply !== false;
  const batchSize = Math.min(500, Math.max(1, opts.batchSize ?? 100));

  const result: BackfillSalesDocumentQuoteCustomersResult = {
    scanned: 0,
    linked: 0,
    created: 0,
    reused: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("sales_documents")
      .select("id, customer_id, customer_name, customer_email, created_at")
      .is("customer_id", null)
      .or("source.eq.customer_request,request_details.not.is.null")
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const raw of rows) {
      const row = raw as {
        id: string;
        customer_id?: string | null;
        customer_name?: string;
        customer_email?: string;
      };

      result.scanned += 1;

      if (row.customer_id) {
        result.skipped += 1;
        continue;
      }

      if (!apply) {
        result.linked += 1;
        continue;
      }

      const ensured = await ensureSalesDocumentCustomer(admin, row.id);
      if (!ensured.ok) {
        result.failed += 1;
        result.errors.push({ documentId: row.id, error: ensured.error });
        continue;
      }

      await propagateCustomerIdToRelatedDocuments(admin, row.id, ensured.customerId);

      result.linked += 1;
      if (ensured.created) {
        result.created += 1;
      } else {
        result.reused += 1;
      }
    }

    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  if (apply && result.linked > 0) {
    await logSystemEvent({
      level: "info",
      source: "sales_document/backfill",
      message: "sales_document.quote_customers_backfilled",
      context: {
        scanned: result.scanned,
        linked: result.linked,
        created: result.created,
        reused: result.reused,
        failed: result.failed,
      },
    });
  }

  return result;
}
