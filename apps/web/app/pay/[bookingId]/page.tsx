import Link from "next/link";
import { loadPayBookingLanding } from "@/lib/pay/payBookingLanding";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PayBookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ bookingId: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { bookingId } = await params;
  const { ref } = await searchParams;
  const reference = ref?.trim() ?? "";

  if (!reference) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Payment link incomplete</h1>
        <p className="text-sm text-neutral-600">
          Open the pay link from your message or email. If something is wrong, reply to the thread we sent you or
          contact support.
        </p>
        <Link href="/" className="text-sm font-medium text-blue-600 hover:underline">
          Back to home
        </Link>
      </main>
    );
  }

  const land = await loadPayBookingLanding(bookingId, reference);
  if (!land.ok) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col justify-center gap-4 px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-neutral-900">Unable to open checkout</h1>
        <p className="text-sm text-neutral-600">{land.error}</p>
        <Link href="/booking" className="text-sm font-medium text-blue-600 hover:underline">
          Start a new booking
        </Link>
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
    </main>
  );
}
