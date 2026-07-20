import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { buildMarketingWebPageJsonLd } from "@/lib/seo/marketingWebPageJsonLd";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/site/customerSupport";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/data-deletion";
const CANONICAL = absoluteCanonicalUrl(PATH);

const META_DESC = clampMetaDescription(
  "Request deletion of Shalean social-platform connection data linked via Facebook or Instagram Login.",
);

export const metadata: Metadata = {
  title: "Data Deletion Request | Shalean Cleaning Services",
  description: META_DESC,
  robots: SEO_INDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: "Data Deletion Request | Shalean Cleaning Services",
    description: META_DESC,
    imageAlt: "Shalean Cleaning Services — data deletion request",
  }),
};

const JSON_LD = buildMarketingWebPageJsonLd({
  path: PATH,
  name: "Data Deletion Request | Shalean Cleaning Services",
  description: META_DESC,
  breadcrumbLabel: "Data Deletion",
});

export default function DataDeletionPage() {
  return (
    <LegalPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Data deletion request</h1>
      <p className="mt-4 text-base leading-relaxed text-slate-600">
        This page explains how to request deletion of <strong>social-platform connection data</strong> that
        Shalean may hold when a Facebook or Instagram account was connected for marketing publishing (for
        example Page or Instagram access tokens stored for the Shalean Marketing Hub).
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">What this covers</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-slate-600">
        <li>OAuth connection records and encrypted access tokens for Facebook / Instagram publishing</li>
        <li>Related Meta app-scoped identifiers used only for that social connection</li>
      </ul>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Booking history, invoices, cleaner profiles, and other customer or business records are{" "}
        <strong>not</strong> deleted automatically through this process. Those require a separate, authenticated
        request and operator review.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">How to request deletion</h2>
      <ol className="mt-3 list-decimal space-y-3 pl-5 text-base leading-relaxed text-slate-600">
        <li>
          Prefer Meta&apos;s built-in flow: Facebook → Settings &amp; privacy → Settings → Apps and websites →
          remove Shalean Social Publishing, then use <em>Send Request</em> under Removed Apps and Websites if
          offered. That triggers our secure callback and issues a confirmation code.
        </li>
        <li>
          Or email{" "}
          <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}?subject=${encodeURIComponent("Social data deletion request")}`} className="font-medium text-blue-600 hover:underline">
            {CUSTOMER_SUPPORT_EMAIL}
          </a>{" "}
          with subject line <em>Social data deletion request</em>, and include the Facebook/Instagram Page name
          you connected (do not send access tokens or passwords).
        </li>
        <li>
          You may also use our{" "}
          <Link href="/contact" className="font-medium text-blue-600 hover:underline">
            contact page
          </Link>
          .
        </li>
      </ol>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Confirmation and status</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        When Meta calls our deletion callback, we return a confirmation code and a status URL. Open{" "}
        <Link href="/data-deletion/status" className="font-medium text-blue-600 hover:underline">
          /data-deletion/status
        </Link>{" "}
        and enter the code to see whether the request was acknowledged. Actual removal of social connection
        records is completed by an authorized operator after verification — we do not auto-wipe customer or
        business data from an unauthenticated callback alone.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">Privacy policy</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        See our{" "}
        <Link href="/privacy-policy" className="font-medium text-blue-600 hover:underline">
          Privacy Policy
        </Link>{" "}
        for how booking and customer data are handled.{" "}
        <span className="text-slate-500">
          (Legal review recommended before treating this page as a complete statutory privacy notice.)
        </span>
      </p>
    </LegalPageShell>
  );
}
