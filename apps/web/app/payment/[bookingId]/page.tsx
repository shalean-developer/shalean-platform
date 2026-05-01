import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PaymentCheckoutClient } from "./PaymentCheckoutClient";
import { bookingRowToPaymentSummary } from "@/lib/payments/bookingPaymentSummary";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PageProps = {
  params: Promise<{ bookingId: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { bookingId } = await params;
  return { title: `Pay for booking · ${bookingId.slice(0, 8)}…` };
}

export default async function PaymentBookingPage({ params }: PageProps) {
  const { bookingId } = await params;
  if (!UUID_RE.test(bookingId)) notFound();

  const admin = getSupabaseAdmin();
  if (!admin) {
    return (
      <div className="mx-auto w-full max-w-[576px] px-4 py-16 text-center">
        <p className="text-zinc-600 dark:text-zinc-400">Payments are temporarily unavailable.</p>
        <Link href="/dashboard/bookings" className="mt-4 inline-block text-sm font-medium text-blue-600 underline">
          Dashboard
        </Link>
      </div>
    );
  }

  const { data: row, error } = await admin
    .from("bookings")
    .select("id, customer_email, service, rooms, bathrooms, extras, total_price, total_paid_zar, status, booking_snapshot, payment_completed_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (error || !row) notFound();

  const r = row as {
    id: string;
    status?: string | null;
    payment_completed_at?: string | null;
    customer_email?: string | null;
    service?: string | null;
    rooms?: number | null;
    bathrooms?: number | null;
    extras?: unknown;
    total_price?: number | string | null;
    total_paid_zar?: number | null;
    booking_snapshot?: unknown;
  };

  if (r.status !== "pending_payment") {
    const paid = r.payment_completed_at != null && String(r.payment_completed_at).trim() !== "";
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{paid ? "Already paid" : "Cannot pay online"}</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {paid ? "This booking is already confirmed." : "This booking is not awaiting payment."}
        </p>
        <Link
          href={paid ? `/dashboard/bookings/${r.id}` : "/dashboard/bookings"}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-blue-600 px-6 text-sm font-medium text-white"
        >
          {paid ? "View booking" : "Go to dashboard"}
        </Link>
      </div>
    );
  }

  const summary = bookingRowToPaymentSummary(r);
  if (!summary.email?.trim()) {
    return (
      <div className="mx-auto w-full max-w-[576px] px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Cannot pay online</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This booking is missing a customer email.</p>
        <Link href="/dashboard/bookings" className="mt-6 inline-block text-sm font-medium text-blue-600 underline">
          Dashboard
        </Link>
      </div>
    );
  }
  if (summary.priceZar <= 0) {
    return (
      <div className="mx-auto w-full max-w-[576px] px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Amount not set</h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">This booking does not have a payable total yet.</p>
        <Link href="/dashboard/bookings" className="mt-6 inline-block text-sm font-medium text-blue-600 underline">
          Dashboard
        </Link>
      </div>
    );
  }

  return <PaymentCheckoutClient summary={summary} />;
}
