import "server-only";

import { getZohoInvoicePdf } from "@/lib/zoho/zohoBooksService";

export type MonthlyInvoiceEmailPdfAttachment = {
  filename: string;
  /** Base64-encoded PDF bytes (Resend attachment format). */
  content: string;
};

/** Zoho Books invoice PDF for Resend email attachment (null when unavailable). */
export async function loadMonthlyInvoiceEmailPdfAttachment(params: {
  zohoInvoiceId: string | null | undefined;
  month: string;
}): Promise<MonthlyInvoiceEmailPdfAttachment | null> {
  const id = String(params.zohoInvoiceId ?? "").trim();
  if (!id) return null;
  if (!process.env.ZOHO_CLIENT_ID?.trim() || !process.env.ZOHO_REFRESH_TOKEN?.trim()) {
    return null;
  }

  const res = await getZohoInvoicePdf(id);
  if (!res.ok) return null;

  const safeMonth = params.month.trim().replace(/[^0-9-]/g, "") || "invoice";
  return {
    filename: `shalean-invoice-${safeMonth}.pdf`,
    content: Buffer.from(res.pdf).toString("base64"),
  };
}
