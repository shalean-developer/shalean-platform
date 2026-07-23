import type { Metadata } from "next";
import { buildMarketingSocialMetadata } from "@/lib/seo/marketingPageSocialMeta";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW, SEO_NOINDEX_FOLLOW } from "@/lib/site/seoRobots";

/** Public cleaner recruitment landing — indexable exception under `/cleaner/*`. */
export const CLEANER_APPLY_LANDING_PATH = "/cleaner/apply" as const;

/** Public application form — crawlable at HTTP layer, but must remain noindex. */
export const CLEANER_APPLY_FORM_PATH = "/cleaner/apply/form" as const;

/**
 * Narrow Google-compatible Allow exception for robots.txt.
 * The `$` end-anchor prevents `/cleaner/apply/form` from matching.
 */
export const CLEANER_APPLY_LANDING_ROBOTS_ALLOW = "/cleaner/apply$" as const;

export const CLEANER_APPLY_LANDING_TITLE = "Apply as a Cleaner | Shalean Cape Town";
export const CLEANER_APPLY_LANDING_DESCRIPTION =
  "Join Shalean as a cleaner in Cape Town. Flexible hours, weekly payouts, and jobs near you. Learn more and apply online.";

export const CLEANER_APPLY_FORM_TITLE = "Cleaner Application Form | Shalean";
export const CLEANER_APPLY_FORM_DESCRIPTION =
  "Submit your application to work as a Shalean cleaner in Cape Town.";

export function cleanerApplyLandingCanonical(): string {
  return absoluteCanonicalUrl(CLEANER_APPLY_LANDING_PATH);
}

export function cleanerApplyFormCanonical(): string {
  return absoluteCanonicalUrl(CLEANER_APPLY_FORM_PATH);
}

/** Indexable recruitment landing metadata (overrides parent `/cleaner` noindex + root homepage OG/canonical). */
export function buildCleanerApplyLandingMetadata(): Metadata {
  const canonical = cleanerApplyLandingCanonical();
  return {
    title: CLEANER_APPLY_LANDING_TITLE,
    description: CLEANER_APPLY_LANDING_DESCRIPTION,
    robots: SEO_INDEX_FOLLOW,
    alternates: { canonical },
    ...buildMarketingSocialMetadata({
      url: canonical,
      title: CLEANER_APPLY_LANDING_TITLE,
      description: CLEANER_APPLY_LANDING_DESCRIPTION,
      imageAlt: "Apply to join Shalean as a cleaner in Cape Town",
    }),
  };
}

/**
 * Public form metadata: noindex + self-canonical (must not inherit homepage canonical).
 * Form remains publicly accessible without login; robots.txt Disallow is not access control.
 */
export function buildCleanerApplyFormMetadata(): Metadata {
  const canonical = cleanerApplyFormCanonical();
  return {
    title: CLEANER_APPLY_FORM_TITLE,
    description: CLEANER_APPLY_FORM_DESCRIPTION,
    robots: SEO_NOINDEX_FOLLOW,
    alternates: { canonical },
  };
}
