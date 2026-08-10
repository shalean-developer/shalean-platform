import "server-only";

import { zohoBooksClient } from "@/lib/zoho/zohoBooksClient";
import { getZohoInvoice } from "@/lib/zoho/zohoBooksService";

export type ZohoCollectionPaymentItem = {
  zohoInvoiceId: string;
  amountZar: number;
};

/**
 * Records one Zoho Books customer payment and allocates it across multiple invoices.
 * This is the accounting mirror of Shalean's statement-level payment: each invoice
 * remains separate while one receipt settles the oldest arranged balance and the
 * current invoice together.
 */
export async function markZohoInvoiceCollectionPaid(params: {
  invoices: ZohoCollectionPaymentItem[];
  paymentDate: string;
  reference?: string;
}): Promise<{ ok: true; paymentId: string } | { ok: false; error: string }> {
  try {
    const invoices = params.invoices.filter((x) => x.zohoInvoiceId.trim() && x.amountZar > 0);
    if (!invoices.length) return { ok: false, error: "no_zoho_invoices" };

    const first = await getZohoInvoice(invoices[0].zohoInvoiceId);
    if (!first.ok || !first.customerId) {
      return { ok: false, error: first.ok ? "zoho_customer_missing" : first.error };
    }

    // Safety: all invoices in one statement payment must belong to the same Zoho customer.
    for (const item of invoices.slice(1)) {
      const inv = await getZohoInvoice(item.zohoInvoiceId);
      if (!inv.ok) return { ok: false, error: inv.error };
      if (!inv.customerId || inv.customerId !== first.customerId) {
        return { ok: false, error: "zoho_customer_mismatch" };
      }
    }

    const amount = invoices.reduce((sum, x) => sum + x.amountZar, 0);
    const res = await zohoBooksClient.post<{ payment: { payment_id: string } }>("/customerpayments", {
      customer_id: first.customerId,
      payment_mode: "bank_transfer",
      amount,
      date: params.paymentDate,
      invoices: invoices.map((x) => ({
        invoice_id: x.zohoInvoiceId,
        amount_applied: x.amountZar,
      })),
      ...(params.reference ? { reference_number: params.reference } : {}),
    });

    return { ok: true, paymentId: res.payment.payment_id };
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}
