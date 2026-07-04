import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  createBookingFromSalesQuoteInvoice,
  syncBookingPaymentFromSalesDocumentInvoice,
} from "@/lib/salesDocument/createBookingFromSalesQuoteInvoice";
import { logSystemEvent } from "@/lib/logging/systemLog";

export type BackfillSalesDocumentQuoteBookingsOptions = {
  apply?: boolean;
  batchSize?: number;
};

export type BackfillSalesDocumentQuoteBookingsResult = {
  scanned: number;
  created: number;
  alreadyExisted: number;
  paymentSynced: number;
  skipped: number;
  failed: number;
  errors: Array<{ invoiceId: string; quoteId: string; error: string }>;
};

type InvoiceCandidate = {
  id: string;
  converted_from_id: string;
  status: string | null;
  total_cents: number | null;
};

async function invoiceHasLinkedBooking(admin: SupabaseClient, invoiceId: string): Promise<boolean> {
  const { data, error } = await admin
    .from("bookings")
    .select("id")
    .eq("sales_document_id", invoiceId)
    .maybeSingle();

  if (error) {
    const code = (error as { code?: string }).code;
    if (code === "42703") {
      throw new Error(
        "bookings.sales_document_id column missing — run migration 20261034_bookings_sales_document_id.sql first.",
      );
    }
    throw new Error(error.message);
  }

  return Boolean(data?.id);
}

/**
 * Backfill bookings for historical sales quotes that were converted to invoices
 * before automatic booking creation shipped.
 */
export async function backfillSalesDocumentQuoteBookings(
  admin: SupabaseClient,
  opts: BackfillSalesDocumentQuoteBookingsOptions = {},
): Promise<BackfillSalesDocumentQuoteBookingsResult> {
  const apply = opts.apply !== false;
  const batchSize = Math.min(500, Math.max(1, opts.batchSize ?? 100));

  const result: BackfillSalesDocumentQuoteBookingsResult = {
    scanned: 0,
    created: 0,
    alreadyExisted: 0,
    paymentSynced: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  let offset = 0;

  for (;;) {
    const { data, error } = await admin
      .from("sales_documents")
      .select("id, converted_from_id, status, total_cents, created_at")
      .eq("document_type", "invoice")
      .not("converted_from_id", "is", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(error.message);
    }

    const rows = (data ?? []) as InvoiceCandidate[];
    if (rows.length === 0) break;

    for (const row of rows) {
      const invoiceId = String(row.id ?? "").trim();
      const quoteId = String(row.converted_from_id ?? "").trim();
      if (!invoiceId || !quoteId) {
        result.skipped += 1;
        continue;
      }

      result.scanned += 1;

      const hasBooking = await invoiceHasLinkedBooking(admin, invoiceId);
      if (hasBooking) {
        result.alreadyExisted += 1;
        if (apply && String(row.status ?? "").toLowerCase() === "paid") {
          const totalCents = Math.max(0, Math.round(Number(row.total_cents ?? 0)));
          await syncBookingPaymentFromSalesDocumentInvoice(admin, invoiceId, {
            amountCents: totalCents,
            reference: `backfill_${invoiceId.slice(0, 8)}`,
          });
          result.paymentSynced += 1;
        }
        continue;
      }

      if (!apply) {
        result.created += 1;
        continue;
      }

      const created = await createBookingFromSalesQuoteInvoice(admin, { quoteId, invoiceId });
      if (!created.ok) {
        result.failed += 1;
        result.errors.push({ invoiceId, quoteId, error: created.error });
        continue;
      }

      if (created.alreadyExisted) {
        result.alreadyExisted += 1;
      } else {
        result.created += 1;
      }

      if (String(row.status ?? "").toLowerCase() === "paid") {
        const totalCents = Math.max(0, Math.round(Number(row.total_cents ?? 0)));
        await syncBookingPaymentFromSalesDocumentInvoice(admin, invoiceId, {
          amountCents: totalCents,
          reference: `backfill_${invoiceId.slice(0, 8)}`,
        });
        result.paymentSynced += 1;
      }
    }

    if (rows.length < batchSize) break;
    offset += batchSize;
  }

  if (apply && (result.created > 0 || result.paymentSynced > 0)) {
    await logSystemEvent({
      level: "info",
      source: "sales_document/backfill",
      message: "sales_document.quote_bookings_backfilled",
      context: {
        scanned: result.scanned,
        created: result.created,
        alreadyExisted: result.alreadyExisted,
        paymentSynced: result.paymentSynced,
        failed: result.failed,
      },
    });
  }

  return result;
}
