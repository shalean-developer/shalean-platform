import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loadPayBookingLanding } from "@/lib/pay/payBookingLanding";
import { PayBookingCheckoutClient } from "@/components/pay/PayBookingCheckoutClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

export default async function PayBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ ref?: string; reference?: string; trxref?: string }>;
}) {
  const { bookingId } = await params;
  const sp = await searchParams;
  const reference =
    sp.ref?.trim() || sp.reference?.trim() || sp.trxref?.trim() || "";

  if (!reference) {
    // Cancelled Paystack return without ref — still allow owner retry via payment-session.
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Payment not completed</h1>
        <p className="text-sm text-neutral-600">
          Your booking is still reserved. You can retry payment below — no duplicate booking will be created.
        </p>
        <PayBookingCheckoutClient
          bookingId={bookingId}
          reference=""
          mode="retry_only"
        />
        <Link href="/book" className="text-sm font-medium text-blue-600 hover:underline">
          Back to booking
        </Link>
      </main>
    );
  }

  const land = await loadPayBookingLanding(bookingId, reference);
  if (!land.ok) {
    if (land.alreadyPaid) {
      const successRef = land.reference?.trim() || reference;
      redirect(`/account/success?reference=${encodeURIComponent(successRef)}`);
    }
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Unable to open checkout</h1>
        <p className="text-sm text-neutral-600">{land.error}</p>
        {land.retryable ? (
          <PayBookingCheckoutClient
            bookingId={bookingId}
            reference={reference}
            mode="retry_only"
            initialError={land.error}
          />
        ) : (
          <Link href="/book" className="text-sm font-medium text-blue-600 hover:underline">
            Start a new booking
          </Link>
        )}
      </main>
    );
  }

  const price =
    land.amountZar != null ? `R ${land.amountZar.toLocaleString("en-ZA")}` : "Total confirmed at checkout";
  const when =
    land.date && land.time ? `${land.date} · ${land.time}` : land.date ? land.date : "We will confirm your time";

  return (
    <main className="mx-auto max-w-lg px-4 py-12">
      <div className="mb-2 text-sm font-medium text-blue-600">Shalean</div>
      <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">Complete your payment</h1>
      <p className="mt-2 text-sm text-neutral-600">Review your visit below, then continue to our secure checkout.</p>

      {land.refreshed && land.message ? (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {land.message}
        </p>
      ) : null}

      <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">Service</p>
        <p className="mt-1 text-lg font-medium text-neutral-900">{land.serviceLabel}</p>
        <div className="mt-4 grid gap-3 text-sm text-neutral-700">
          <div>
            <span className="text-neutral-500">When</span>
            <p className="font-medium text-neutral-900">{when}</p>
          </div>
          <div>
            <span className="text-neutral-500">Total</span>
            <p className="font-medium text-neutral-900">{price}</p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-col gap-3">
        <PayBookingCheckoutClient
          bookingId={land.bookingId}
          reference={land.reference}
          authorizationUrl={land.authorizationUrl}
          mode="checkout"
        />
        <p className="text-center text-xs text-neutral-500">
          You will complete payment on Paystack (cards, EFT, and more). We never store your card on our servers.
        </p>
      </div>
    </main>
  );
}
