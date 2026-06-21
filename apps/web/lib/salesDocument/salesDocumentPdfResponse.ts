import "server-only";

import { NextResponse } from "next/server";

import { getZohoEstimatePdf, getZohoInvoicePdf } from "@/lib/zoho/zohoBooksService";

export async function salesDocumentPdfResponse(
  row: {
    document_type: string;
    zoho_invoice_id?: string | null;
    zoho_estimate_id?: string | null;
  },
  filenameBase: string,
): Promise<NextResponse> {
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_REFRESH_TOKEN) {
    return NextResponse.json({ error: "Document PDF is not available." }, { status: 503 });
  }

  const isQuote = row.document_type === "quote";
  const id = isQuote
    ? String(row.zoho_estimate_id ?? "").trim()
    : String(row.zoho_invoice_id ?? "").trim();

  if (!id) {
    return NextResponse.json({ error: "No document PDF for this record yet." }, { status: 404 });
  }

  const res = isQuote ? await getZohoEstimatePdf(id) : await getZohoInvoicePdf(id);
  if (!res.ok) {
    return NextResponse.json({ error: "Could not load document PDF." }, { status: 502 });
  }

  const safe = filenameBase.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 60) || "document";
  const label = isQuote ? "quote" : "invoice";
  return new NextResponse(res.pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${safe}-${label}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
