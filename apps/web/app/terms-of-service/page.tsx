import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/terms-of-service";
const CANONICAL = absoluteCanonicalUrl(PATH);

const META_DESC = clampMetaDescription(
  "Terms of Service for Shalean Cleaning Services—booking rules, payments, cancellations, and customer responsibilities in Cape Town.",
);

export const metadata: Metadata = {
  title: "Terms of Service | Shalean Cleaning Services",
  description: META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: CANONICAL,
    title: "Terms of Service | Shalean Cleaning Services",
    description: META_DESC,
  },
  twitter: {
    card: "summary",
    title: "Terms of Service | Shalean Cleaning Services",
    description: META_DESC,
  },
};

export default function TermsOfServicePage() {
  return (
    <LegalPageShell>
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Terms of Service</h1>
      <p className="mt-4 text-base leading-relaxed text-slate-600">
        By booking with Shalean Cleaning Services, you agree to these terms. Our services are subject to
        availability, accurate booking details, and successful payment confirmation.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Bookings</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Customers must provide accurate service addresses, access instructions, and cleaning requirements when
        booking. Arrival windows and scope are based on the service type and property details selected at checkout.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Payments</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Payments are processed securely through our payment providers. Booking totals are based on the selected
        service, property details, and add-ons quoted before you confirm.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Cancellations &amp; rescheduling</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Please contact us as early as possible if you need to reschedule or cancel. Late cancellations may incur
        fees where a cleaner has already been assigned and travel reserved. See our{" "}
        <Link href="/faq" className="font-medium text-blue-600 hover:underline">
          FAQ
        </Link>{" "}
        for typical policies.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Contact</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        For service questions, email{" "}
        <a href="mailto:hello@shalean.co.za" className="font-medium text-blue-600 hover:underline">
          hello@shalean.co.za
        </a>{" "}
        or use our{" "}
        <Link href="/contact" className="font-medium text-blue-600 hover:underline">
          contact page
        </Link>
        .
      </p>

      <p className="mt-8 text-sm text-slate-500">
        See also our{" "}
        <Link href="/privacy-policy" className="text-blue-600 hover:underline">
          Privacy Policy
        </Link>
        .
      </p>
    </LegalPageShell>
  );
}
