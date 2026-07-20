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
const EFFECTIVE_DATE = "20 July 2026";

const META_DESC = clampMetaDescription(
  "Privacy Policy for Shalean Cleaning Services—how we collect, use, and protect personal information under South African POPIA.",
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
      <p className="mt-2 text-sm text-slate-500">Effective date: {EFFECTIVE_DATE}</p>
      <p className="mt-4 text-base leading-relaxed text-slate-600">
        This notice explains how <strong>Shalean Cleaning Services</strong> (&quot;Shalean&quot;, &quot;we&quot;,
        &quot;us&quot;) processes personal information when you use shalean.co.za, our booking flows, customer
        support channels, and (where enabled) marketing social-publishing tools. We process personal
        information in line with the Protection of Personal Information Act 4 of 2013 (POPIA) and related
        South African requirements, subject to final confirmation of legal entity particulars by counsel.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">1. Responsible party and contact</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        The responsible party for this processing is Shalean Cleaning Services, operating in Cape Town, South
        Africa. Privacy and data-subject requests:{" "}
        <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:underline">
          {CUSTOMER_SUPPORT_EMAIL}
        </a>
        . General enquiries:{" "}
        <a href="mailto:hello@shalean.co.za" className="font-medium text-blue-600 hover:underline">
          hello@shalean.co.za
        </a>
        . You may also use our{" "}
        <Link href="/contact" className="font-medium text-blue-600 hover:underline">
          contact page
        </Link>
        . Registered company name, registration number, and physical address will be confirmed by counsel and
        updated here when finalized — until then, use the contacts above.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">2. Categories of information we collect</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-base leading-relaxed text-slate-600">
        <li>
          <strong>Customers / booking contacts:</strong> name, phone number, email address, service address,
          booking details, payment references, and communication history when you book or contact us.
        </li>
        <li>
          <strong>Account / authentication:</strong> login identifiers and session cookies needed to keep you
          signed in securely.
        </li>
        <li>
          <strong>Marketing Hub administrators (staff):</strong> administrator email used when connecting
          social accounts; connection status and health; OAuth correlation identifiers in transient cookies and
          server logs (redacted).
        </li>
        <li>
          <strong>Social-platform connection data (when Facebook / Instagram publishing is connected):</strong>{" "}
          Facebook Page identifiers and names; Instagram professional account identifiers and display names;
          encrypted access-token envelopes; token expiry timestamps where provided; connection status/health;
          a non-reversible hash of the Meta app-scoped user id for deletion correlation; publishing job and
          history records including provider post/media identifiers and campaign metadata. We do not store full
          payment card numbers on our servers.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">3. Purpose and lawful justification</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        We use personal information to confirm bookings, assign cleaners, process payments, provide support,
        send service updates, operate and secure our platforms, and (for authorized administrators) publish
        marketing content to connected social accounts. We do not sell personal information. Lawful bases under
        POPIA typically include performance of a contract (bookings/payments), legitimate interests in operating
        a secure service, and consent or contract where an administrator connects a social account. Specific
        justifications for each processing activity should be confirmed with counsel.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">4. Social-platform integrations</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Where Meta (Facebook / Instagram) or other providers are enabled by Shalean, administrators may authorize
        Shalean to obtain Page or professional-account access tokens for publishing. Meta processes data under
        Meta&apos;s terms and privacy policy. Shalean stores connection credentials in encrypted form and uses
        them only for the authorized publishing purpose. Provider feature flags may keep integrations disabled
        until an explicit production release gate. Instructions for requesting deletion of social connection
        data are at{" "}
        <Link href="/data-deletion" className="font-medium text-blue-600 hover:underline">
          /data-deletion
        </Link>
        .
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">5. Operators and service providers</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        We use operators to host and support the service, including website hosting and edge delivery (for
        example Vercel), database and authentication infrastructure (for example Supabase), payment processing
        (for example Paystack), and social platforms (for example Meta). Operators process information on our
        instructions for the purposes above.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">6. Cross-border processing</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Some operators and social platforms may process information outside South Africa (including in the United
        States or other jurisdictions). Where cross-border transfers occur, we rely on appropriate contractual
        and technical safeguards. Counsel should confirm the transfer mechanism inventory before Live Meta
        enablement.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">7. Security safeguards</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        We apply administrative and technical measures appropriate to the risk, including HTTPS, access control
        for administrative functions, encryption of social OAuth tokens at rest, signature verification of Meta
        data-deletion callbacks, and redaction of tokens and provider identifiers from routine logs. No method
        of transmission or storage is completely secure.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">8. Retention</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Booking and payment-related records are retained as needed for accounting, dispute resolution, and legal
        compliance. Social connection credentials are retained while a connection remains active and are
        removed or invalidated after a verified deletion or disconnect. Publishing history and operational logs
        may be retained for security, audit, and operational integrity.{" "}
        <strong>Specific calendar retention periods are not yet defined as an organizational control</strong> —
        they must be set by operations with counsel and will be published here when adopted. We do not invent
        retention periods in this notice.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">9. Your rights (data subjects)</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        Subject to POPIA, you may request access to your personal information, correction or deletion where
        appropriate, objection to certain processing, and restriction or complaint escalation. To exercise
        rights, email{" "}
        <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:underline">
          {CUSTOMER_SUPPORT_EMAIL}
        </a>{" "}
        with enough detail for us to verify your identity. Social-connection deletion via Meta is described on{" "}
        <Link href="/data-deletion" className="font-medium text-blue-600 hover:underline">
          /data-deletion
        </Link>
        ; booking or customer-record deletion is a separate authenticated process and is not performed
        automatically by Meta&apos;s callback.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">10. Complaints and Information Regulator</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        If you are not satisfied with our response, you may lodge a complaint with the Information Regulator
        (South Africa). See{" "}
        <a
          href="https://inforegulator.org.za/complaints/"
          className="font-medium text-blue-600 hover:underline"
          rel="noopener noreferrer"
          target="_blank"
        >
          inforegulator.org.za/complaints
        </a>{" "}
        and POPIA complaints via{" "}
        <a
          href="mailto:POPIAComplaints@inforegulator.org.za"
          className="font-medium text-blue-600 hover:underline"
        >
          POPIAComplaints@inforegulator.org.za
        </a>
        . We ask that you contact us first so we can try to resolve the matter.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">11. Cookies and sessions</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        We use cookies and similar technologies for essential session management (for example keeping you signed
        in), security (including OAuth CSRF state during social connect), and, where configured, analytics or
        marketing measurement. Essential cookies are required for the site to function. You can control cookies
        through your browser settings; blocking essential cookies may break booking or account features.
      </p>

      <h2 className="mt-10 text-xl font-semibold text-slate-900">12. Changes to this policy</h2>
      <p className="mt-3 text-base leading-relaxed text-slate-600">
        We may update this notice to reflect operational or legal changes. The effective date above will be
        revised when material changes are published. Continued use of the services after an update constitutes
        notice of the revised policy for website visitors; where POPIA requires further notice, we will take
        reasonably practicable steps.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        See also our{" "}
        <Link href="/terms-of-service" className="text-blue-600 hover:underline">
          Terms of Service
        </Link>{" "}
        and{" "}
        <Link href="/data-deletion" className="text-blue-600 hover:underline">
          data deletion instructions
        </Link>
        . This page is an engineering-aligned privacy notice for product and Meta App Dashboard use; it is not a
        substitute for qualified South African legal counsel.
      </p>
    </LegalPageShell>
  );
}
