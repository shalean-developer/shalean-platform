import type { Metadata } from "next";
import Link from "next/link";
import { LegalPageShell } from "@/components/legal/LegalPageShell";
import { verifyDataDeletionConfirmationCode } from "@/lib/meta/dataDeletion";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { buildMarketingWebPageJsonLd } from "@/lib/seo/marketingWebPageJsonLd";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { CUSTOMER_SUPPORT_EMAIL } from "@/lib/site/customerSupport";
import { SEO_NOINDEX_FOLLOW } from "@/lib/site/seoRobots";

const PATH = "/data-deletion/status";
const CANONICAL = absoluteCanonicalUrl(PATH);

const META_DESC = clampMetaDescription(
  "Check the status of a Shalean Meta social-connection data deletion request using your confirmation code.",
);

export const metadata: Metadata = {
  title: "Data Deletion Status | Shalean Cleaning Services",
  description: META_DESC,
  robots: SEO_NOINDEX_FOLLOW,
  alternates: { canonical: CANONICAL },
  ...buildMarketingSocialMetadata({
    url: CANONICAL,
    title: "Data Deletion Status | Shalean Cleaning Services",
    description: META_DESC,
    imageAlt: "Shalean Cleaning Services — data deletion status",
  }),
};

const JSON_LD = buildMarketingWebPageJsonLd({
  path: PATH,
  name: "Data Deletion Status | Shalean Cleaning Services",
  description: META_DESC,
  breadcrumbLabel: "Data Deletion Status",
});

type Props = {
  searchParams: Promise<{ code?: string | string[] }>;
};

function readCode(raw: string | string[] | undefined): string {
  if (typeof raw === "string") return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return "";
}

export default async function DataDeletionStatusPage({ searchParams }: Props) {
  const params = await searchParams;
  const code = readCode(params.code);
  const verified = code ? verifyDataDeletionConfirmationCode(code) : { ok: false as const };
  const issuedLabel =
    verified.ok === true
      ? new Date(verified.issuedAtUnix * 1000).toISOString().replace(/\.\d{3}Z$/, "Z")
      : null;

  return (
    <LegalPageShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Data deletion status</h1>

      {!code ? (
        <p className="mt-4 text-base leading-relaxed text-slate-600">
          Add your confirmation code to the URL as{" "}
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">?code=…</code>, or start from the{" "}
          <Link href="/data-deletion" className="font-medium text-blue-600 hover:underline">
            data deletion instructions
          </Link>
          .
        </p>
      ) : verified.ok ? (
        <div className="mt-4 space-y-3 text-base leading-relaxed text-slate-600">
          <p>
            <strong className="text-slate-900">Status:</strong> Request acknowledged
          </p>
          <p>
            Confirmation code <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm">{code}</code> is
            valid. Issued at approximately {issuedLabel} (UTC).
          </p>
          <p>
            An authorized operator will review and remove applicable <em>social-platform connection</em> data
            (encrypted tokens / connection rows) after verification. Booking, payment, and other customer or
            business records are not deleted by this callback alone.
          </p>
          <p>
            Questions:{" "}
            <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:underline">
              {CUSTOMER_SUPPORT_EMAIL}
            </a>
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-3 text-base leading-relaxed text-slate-600">
          <p>
            <strong className="text-slate-900">Status:</strong> Unknown or invalid confirmation code
          </p>
          <p>
            We could not verify that code. Check for typos, or email{" "}
            <a href={`mailto:${CUSTOMER_SUPPORT_EMAIL}`} className="font-medium text-blue-600 hover:underline">
              {CUSTOMER_SUPPORT_EMAIL}
            </a>{" "}
            with your request details (no tokens or passwords).
          </p>
          <p>
            <Link href="/data-deletion" className="font-medium text-blue-600 hover:underline">
              ← Data deletion instructions
            </Link>
          </p>
        </div>
      )}
    </LegalPageShell>
  );
}
