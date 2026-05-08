import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BookingPaymentPage } from "@/components/booking/checkout/pages/BookingPaymentPage";
import type { BookingPaymentPagePayload } from "@/lib/booking/bookingPaymentTypes";
import { loadBookingPaymentServerState } from "@/lib/booking/loadBookingPaymentServerState";
import { isBookingPaymentUuid } from "@/lib/booking/bookingPaymentUuid";
import { buildBookingCleanerRedirectHref } from "@/lib/booking/bookingUrl";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const sp = await searchParams;
  const raw = sp.bookingId;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  const base = noIndexNoFollowCanonical("/booking/payment");
  if (id && isBookingPaymentUuid(id.trim())) {
    const tid = id.trim();
    return { ...base, title: `Pay for booking · ${tid.slice(0, 8)}…` };
  }
  return { ...base, title: "Review & pay | Shalean" };
}

export default async function Page({ searchParams }: PageProps) {
  const sp = await searchParams;
  const raw = sp.bookingId;
  const bookingId = typeof raw === "string" ? raw.trim() : Array.isArray(raw) ? raw[0]?.trim() ?? "" : "";
  if (!bookingId) redirect(buildBookingCleanerRedirectHref(sp));
  if (!isBookingPaymentUuid(bookingId)) notFound();

  const serverPayload: BookingPaymentPagePayload = await loadBookingPaymentServerState(bookingId);

  return <BookingPaymentPage serverPayload={serverPayload} />;
}
