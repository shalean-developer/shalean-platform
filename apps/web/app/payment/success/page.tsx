import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import type { PaystackVerifyPostResponse } from "@/lib/booking/paystackVerifyResponse";

/** Path-only canonical joins root `metadataBase` (`app/layout.tsx`) — query strings never become canonical. */
export const metadata: Metadata = {
  title: "Payment successful | Shalean",
  robots: "noindex, nofollow, noimageindex",
  alternates: { canonical: "/payment/success" },
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ reference?: string | string[]; trxref?: string | string[] }>;
};

async function getServerOrigin(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
  return `${proto}://${host}`;
}

/**
 * Runs the real Paystack verify pipeline (finalize + notifications). Idempotent replays are safe.
 */
async function verifyPaystackOnSuccessPage(reference: string): Promise<{
  bookingId: string | null;
  verifyNote: string | null;
}> {
  const origin = await getServerOrigin();
  if (!origin) {
    return { bookingId: null, verifyNote: "Server configuration error." };
  }

  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  const realIp = h.get("x-real-ip");

  const res = await fetch(`${origin}/api/paystack/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(fwd ? { "x-forwarded-for": fwd } : {}),
      ...(realIp && !fwd ? { "x-real-ip": realIp } : {}),
    },
    body: JSON.stringify({ reference }),
    cache: "no-store",
  });

  let json: PaystackVerifyPostResponse;
  try {
    json = (await res.json()) as PaystackVerifyPostResponse;
  } catch {
    return { bookingId: null, verifyNote: "Could not read verification response." };
  }

  if (res.status === 429) {
    return { bookingId: null, verifyNote: "Too many verification attempts. Wait a moment and refresh this page." };
  }

  if (!res.ok || json.success !== true || json.ok !== true || json.paymentStatus !== "success") {
    const err =
      json.success === false && typeof json.error === "string" && json.error.trim()
        ? json.error.trim()
        : "Payment is still processing or could not be verified. Refresh in a moment.";
    return { bookingId: null, verifyNote: err };
  }

  const state = json.state;
  if (state === "payment_mismatch" || state === "payment_reconciliation_required") {
    return {
      bookingId: json.bookingId ?? null,
      verifyNote:
        typeof json.upsertError === "string" && json.upsertError.trim()
          ? json.upsertError.trim()
          : "Payment could not be matched to this booking. Contact support with your Paystack reference.",
    };
  }

  if (!json.bookingInDatabase || !json.bookingId) {
    return {
      bookingId: null,
      verifyNote:
        typeof json.upsertError === "string" && json.upsertError.trim()
          ? json.upsertError.trim()
          : "Payment received — your booking is still being saved. Refresh this page or check your dashboard shortly.",
    };
  }

  return { bookingId: json.bookingId, verifyNote: null };
}

export default async function PaymentSuccessPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const rawRef = sp.reference ?? sp.trxref;
  const reference = (Array.isArray(rawRef) ? rawRef[0] : rawRef)?.trim() ?? "";

  let bookingId: string | null = null;
  let verifyNote: string | null = null;

  if (reference) {
    const out = await verifyPaystackOnSuccessPage(reference);
    bookingId = out.bookingId;
    verifyNote = out.verifyNote;
  } else {
    verifyNote = "Missing payment reference. Open this page from your payment receipt link.";
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-zinc-50 px-4 py-16 dark:bg-zinc-950">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Payment successful</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">Booking confirmed</h1>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          Your payment was verified. We&apos;ll follow up with booking details by email.
        </p>
        {verifyNote ? (
          <p className="mt-4 text-sm text-amber-800 dark:text-amber-200" role="status">
            {verifyNote}
          </p>
        ) : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            Go to dashboard
          </Link>
          {bookingId ? (
            <Link
              href={`/dashboard/bookings/${bookingId}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-zinc-300 bg-white px-6 text-sm font-semibold text-zinc-900 hover:bg-zinc-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50 dark:hover:bg-zinc-800"
            >
              View booking
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
