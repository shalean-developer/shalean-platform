import { redirect } from "next/navigation";
import type { Metadata } from "next";
import {
  isValidServiceSlug,
  SERVICE_CONFIG,
} from "@/src/features/booking-v2/config/serviceConfig";
import { BookingV2Shell } from "@/src/features/booking-v2/BookingV2Shell";

type Props = {
  params: Promise<{ serviceSlug: string }>;
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

export default async function ServiceBookingPage({ params }: Props) {
  const { serviceSlug } = await params;

  if (!isValidServiceSlug(serviceSlug)) {
    redirect("/book");
  }

  return <BookingV2Shell serviceSlug={serviceSlug} />;
}
