import { redirect } from "next/navigation";
import type { Metadata } from "next";
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
    return { title: "Book a Cleaning | Shalean" };
  }
  const config = SERVICE_CONFIG[serviceSlug];
  return {
    title: `Book ${config.label} in Cape Town | Shalean`,
    description: config.description,
    robots: { index: false, follow: false },
  };
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

  return <BookingV2Shell serviceSlug={serviceSlug} />;
}
