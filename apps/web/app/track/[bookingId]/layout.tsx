import type { Metadata } from "next";
import type { ReactNode } from "react";
import { noIndexNoFollowCanonical } from "@/lib/site/transactionalMetadata";

type Props = { params: Promise<{ bookingId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { bookingId } = await params;
  return {
    title: "Track your cleaner | Shalean",
    description: "Live booking tracking for Shalean customers.",
    ...noIndexNoFollowCanonical(`/track/${bookingId}`),
  };
}

export default function TrackBookingLayout({ children }: { children: ReactNode }) {
  return children;
}
