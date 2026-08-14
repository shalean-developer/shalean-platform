import type { Metadata } from "next";
import { CleanerApplyLanding } from "@/components/cleaner/CleanerApplyLanding";
import {
  buildCleanerApplyLandingMetadata,
  CLEANER_APPLY_LANDING_DESCRIPTION,
  CLEANER_APPLY_LANDING_TITLE,
  cleanerApplyLandingCanonical,
} from "@/lib/seo/cleanerApplyLandingSeo";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

export const metadata: Metadata = buildCleanerApplyLandingMetadata();

export default function CleanerApplyPage() {
  const canonical = cleanerApplyLandingCanonical();
  const structuredData = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${canonical}#webpage`,
        url: canonical,
        name: CLEANER_APPLY_LANDING_TITLE,
        description: CLEANER_APPLY_LANDING_DESCRIPTION,
        isPartOf: { "@id": `${absoluteCanonicalUrl("/")}#website` },
        about: { "@id": `${absoluteCanonicalUrl("/")}#organization` },
      },
      {
        "@type": "BreadcrumbList",
        "@id": `${canonical}#breadcrumb`,
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: "Home",
            item: absoluteCanonicalUrl("/"),
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Cleaner application",
            item: canonical,
          },
        ],
      },
      {
        "@type": "Organization",
        "@id": `${absoluteCanonicalUrl("/")}#organization`,
        name: "Shalean Cleaning Services",
        url: absoluteCanonicalUrl("/"),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <CleanerApplyLanding />
    </>
  );
}
