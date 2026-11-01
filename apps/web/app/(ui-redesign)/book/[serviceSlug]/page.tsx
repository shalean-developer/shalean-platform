import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { buildTransactionalPageMetadata } from "@/lib/seo/transactionalPageMetadata";
import {
  isValidServiceSlug,
  SERVICE_CONFIG,
} from "@/src/features/booking-v2/config/serviceConfig";
import { BookingV2Shell } from "@/src/features/booking-v2/BookingV2Shell";
import { collectLegacyBookingSearchParams } from "@/lib/booking/legacyBookingSearchParams";
import { explicitBookServiceSlugFromParam } from "@/lib/booking/legacyBookingToBookRedirect";

type Props = {
  params: Promise<{ serviceSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { serviceSlug } = await params;
  if (!isValidServiceSlug(serviceSlug)) {
    return buildTransactionalPageMetadata({ path: "/book", title: "Book a Cleaning | Shalean", description: "Choose a Shalean cleaning service and see your price before booking." });
  }
  const config = SERVICE_CONFIG[serviceSlug];
  return buildTransactionalPageMetadata({
    path: `/book/${serviceSlug}`,
    title: `Book ${config.label} in Cape Town | Shalean`,
    description: config.description,
  });
}

export default async function ServiceBookingPage({ params, searchParams }: Props) {
  const [{ serviceSlug }, rawSearchParams] = await Promise.all([params, searchParams]);

  if (!isValidServiceSlug(serviceSlug)) {
    redirect("/book");
  }

  const query = collectLegacyBookingSearchParams(rawSearchParams);
  const requestedServiceSlug = explicitBookServiceSlugFromParam(query.get("service"));

  if (requestedServiceSlug && requestedServiceSlug !== serviceSlug) {
    query.set("service", requestedServiceSlug);
    const qs = query.toString();
    redirect(`/book/${requestedServiceSlug}${qs ? `?${qs}` : ""}`);
  }

  return (
    <>
      <h1 className="sr-only">Book {SERVICE_CONFIG[serviceSlug].label} in Cape Town</h1>
      <BookingV2Shell serviceSlug={serviceSlug} />
    </>
  );
}
