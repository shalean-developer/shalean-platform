import "server-only";

import { NextResponse } from "next/server";

import { getZohoInvoicePdf } from "@/lib/zoho/zohoBooksService";

/**
 * Streams a Zoho Books invoice PDF back to the browser, with consistent
 * error/status handling shared by the customer and admin proxy routes.
 *
 * - 503 when Zoho is not configured.
 * - 404 when the record has no synced `zoho_invoice_id`.
 * - 502 when Zoho fails to return the document.
 */
export async function zohoInvoicePdfResponse(
  zohoInvoiceId: string | null | undefined,
  filenameBase: string,
): Promise<NextResponse> {
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    return NextResponse.json({ error: "Invoice PDF is not available." }, { status: 503 });
  }

  const id = (zohoInvoiceId ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "No invoice document for this record yet." }, { status: 404 });
  }

  const res = await getZohoInvoicePdf(id);
  if (!res.ok) {
    return NextResponse.json({ error: "Could not load invoice PDF." }, { status: 502 });
  }

  const safe = filenameBase.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "invoice";
  return new NextResponse(res.pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
