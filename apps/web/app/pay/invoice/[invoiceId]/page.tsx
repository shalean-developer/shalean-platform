import type { Metadata } from "next";
import Link from "next/link";

import { GuestDocumentFooter } from "@/components/public/GuestDocumentFooter";
import { loadPayMonthlyInvoiceLanding } from "@/lib/pay/loadPayMonthlyInvoiceLanding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function PayMonthlyInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ invoiceId: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { invoiceId } = await params;
  const { ref } = await searchParams;
  const reference = ref?.trim() ?? "";

  if (!reference) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Payment link incomplete</h1>
        <p className="text-sm text-neutral-600">Open the pay link from your invoice email.</p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">Back to home</Link>
      </main>
    );
  }

  const land = await loadPayMonthlyInvoiceLanding(invoiceId, reference);
  if (!land.ok) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Unable to open checkout</h1>
        <p className="text-sm text-neutral-600">{land.error}</p>
        <GuestDocumentFooter redirectPath="/account/invoices" />
      </main>
    );
  }

  const price = `R ${land.amountZar.toLocaleString("en-ZA")}`;

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-2 text-sm font-medium text-blue-600">Shalean</div>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Complete your payment</h1>
      <p className="mt-2 text-sm text-neutral-600">Your monthly cleaning invoice is ready to pay.</p>

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Monthly invoice</p>
        <p className="mt-1 text-lg font-medium text-neutral-900">{land.monthLabel}</p>
        <div className="mt-4">
          <span className="text-sm text-neutral-500">Amount due</span>
          <p className="text-lg font-medium text-neutral-900">{price}</p>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <a
          href={land.authorizationUrl}
          className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-center text-sm font-semibold text-white shadow hover:bg-blue-700"
        >
          Pay now — secure checkout
        </a>
        <p className="text-center text-xs text-neutral-500">
          You will complete payment on Paystack (cards, EFT, and more). We never store your card on our servers.
        </p>
      </div>

      <GuestDocumentFooter redirectPath="/account/invoices" />
    </main>
  );
}
