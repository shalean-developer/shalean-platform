import type { Metadata } from "next";

/** Path-only canonical joins root `metadataBase` (`app/layout.tsx`) — query strings never become canonical. */
export const metadata: Metadata = {
  title: "Booking confirmed | Shalean",
  robots: "noindex, nofollow, noimageindex",
  alternates: { canonical: "/booking/success" },
};

export default function BookingSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
