import type { Metadata } from "next";
import { canonicalUrl } from "@/lib/site/canonicalUrl";

/** Post-checkout confirmation — public (no account shell / login required). */
export const metadata: Metadata = {
  title: "Booking confirmed | Shalean",
  robots: "noindex, nofollow, noimageindex",
  alternates: { canonical: canonicalUrl("/account/success") },
};

export default function AccountSuccessLayout({ children }: { children: React.ReactNode }) {
  return children;
}
