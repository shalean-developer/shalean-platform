import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { buildMarketingWebPageJsonLd } from "@/lib/seo/marketingWebPageJsonLd";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/site/customerSupport";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/privacy-policy";
const CANONICAL = absoluteCanonicalUrl(PATH);

const META_DESC = clampMetaDescription(
  "Privacy Policy for Shalean Cleaning Services—how we collect, use, and protect booking and customer data in Cape Town.",
);

export const metadata: Metadata = {
  title: "Privacy Policy | Shalean Cleaning Services",
  description: META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: "Privacy Policy | Shalean Cleaning Services",
    description: META_DESC,
    imageAlt: "Shalean Cleaning Services — privacy policy",
  }),
};

const JSON_LD = buildMarketingWebPageJsonLd({
  path: PATH,
  name: "Privacy Policy | Shalean Cleaning Services",
  description: META_DESC,
  breadcrumbLabel: "Privacy Policy",
});

export default function PrivacyPolicyPage() {
  return (
    <LegalPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Privacy Policy</h1>
      <p className="mt-4 text-base leading-relaxed text-slate-600">
        Shalean Cleaning Services respects your privacy. We collect only the information needed to process
        bookings, contact customers, manage payments, and provide cleaning services across Cape Town.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Information we collect</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        We may collect your name, phone number, email address, service address, booking details, payment
        reference, and communication history when you book online or contact our team.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">How we use your information</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        We use your information to confirm bookings, assign cleaners, process payments, provide support, send
        service updates, and improve our operations. We do not sell personal data to third parties.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Data retention &amp; security</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Booking records are retained as needed for accounting, dispute resolution, and legal compliance. Payment
        card details are handled by our payment providers—we do not store full card numbers on our servers.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Contact</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        For privacy questions, email{" "}
        <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:underline">
          {CUSTOMER_SUPPORT_EMAIL}
        </a>{" "}
        or visit our{" "}
        <Link href="/contact" className="font-medium text-blue-600 hover:underline">
          contact page
        </Link>
        . General enquiries:{" "}
        <a href="mailto:hello@shalean.co.za" className="font-medium text-blue-600 hover:underline">
          hello@shalean.co.za
        </a>
        .
      </p>

      <p className="mt-8 text-sm text-slate-500">
        See also our{" "}
        <Link href="/terms-of-service" className="text-blue-600 hover:underline">
          Terms of Service
        </Link>
        {" "}
        and{" "}
        <Link href="/data-deletion" className="text-blue-600 hover:underline">
          data deletion instructions
        </Link>
        .
      </p>
    </LegalPageShell>
  );
}
