import type { Metadata } from "next";
import Link from "next/link";

import { GuestDocumentFooter } from "@/components/public/GuestDocumentFooter";
import { AcceptQuoteButton } from "@/components/public/AcceptQuoteButton";
import { trustSalesDocPayPageUrl } from "@/lib/pay/trustPayPageUrl";
import { loadPublicSalesDocument } from "@/lib/salesDocument/loadPublicSalesDocument";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function PublicSalesDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ documentId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { documentId } = await params;
  const { token } = await searchParams;
  const accessToken = token?.trim() ?? "";

  if (!accessToken) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Link incomplete</h1>
        <p className="text-sm text-neutral-600">Open the link from your email or message from Shalean.</p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">Back to home</Link>
      </main>
    );
  }

  const loaded = await loadPublicSalesDocument(documentId, accessToken);
  if (!loaded.ok) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Unable to open document</h1>
        <p className="text-sm text-neutral-600">{loaded.error}</p>
        <GuestDocumentFooter />
      </main>
    );
  }

  const doc = loaded.document;
  const isQuote = doc.document_type === "quote";
  const title = isQuote ? "Your quote" : "Your invoice";
  const total = `R ${(doc.total_cents / 100).toLocaleString("en-ZA")}`;
  const balance = doc.balance_cents > 0 ? `R ${(doc.balance_cents / 100).toLocaleString("en-ZA")}` : null;
  const pdfUrl = `/api/public/sales-documents/${doc.id}/pdf?token=${encodeURIComponent(accessToken)}`;
  const payRef = doc.paystack_reference?.trim();
  const payHref =
    !isQuote && balance && payRef
      ? trustSalesDocPayPageUrl(doc.id, payRef, "")
      : null;

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-2 text-sm font-medium text-blue-600">Shalean</div>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">{title}</h1>
      <p className="mt-2 text-sm text-neutral-600">For {doc.customer_name}</p>

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <table className="w-full text-sm">
          <tbody>
            {doc.line_items.map((li, i) => (
              <tr key={i} className="border-b border-neutral-100 last:border-0">
                <td className="py-2 pr-4 text-neutral-800">{li.description}</td>
                <td className="py-2 text-right tabular-nums text-neutral-600">{li.quantity} × R {(li.unit_price_cents / 100).toLocaleString("en-ZA")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 flex justify-between border-t border-neutral-200 pt-4 text-sm font-semibold text-neutral-900">
          <span>Total</span>
          <span>{total}</span>
        </div>
        {balance && doc.status !== "paid" ? (
          <div className="mt-2 flex justify-between text-sm text-orange-700">
            <span>Balance due</span>
            <span>{balance}</span>
          </div>
        ) : null}
        {doc.due_date && !isQuote ? (
          <p className="mt-3 text-xs text-neutral-500">Due: {doc.due_date}</p>
        ) : null}
      </div>

      <div className="mt-8 flex flex-col gap-3">
        {payHref && doc.status !== "paid" ? (
          <Link
            href={payHref}
            className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white shadow hover:bg-blue-700"
          >
            Pay now — secure checkout
          </Link>
        ) : null}
        {isQuote && doc.status !== "accepted" && doc.status !== "paid" ? (
          <AcceptQuoteButton documentId={doc.id} token={accessToken} />
        ) : null}
        {isQuote && doc.status === "accepted" && doc.invoice_view_url ? (
          <div className="space-y-2 text-center">
            <p className="text-sm text-emerald-700">This quote was accepted. Your invoice is ready.</p>
            <Link
              href={doc.invoice_view_url}
              className="inline-flex w-full items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
            >
              View invoice & pay
            </Link>
          </div>
        ) : null}
        {doc.has_pdf ? (
          <a
            href={pdfUrl}
            className="inline-flex items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 py-3 text-center text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
          >
            Download PDF
          </a>
        ) : null}
      </div>

      <GuestDocumentFooter />
    </main>
  );
}
