import type { Metadata } from "next";
import { canonicalUrl } from "@/lib/site/canonicalUrl";

/** Absolute apex canonical — query strings never become canonical. */
export const metadata: Metadata = {
  title: "Booking confirmed | Shalean",
  robots: "noindex, nofollow, noimageindex",
  alternates: { canonical: canonicalUrl("/booking/success") },
};

export default function BookingSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
