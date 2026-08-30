import type { PublicReviewBannerStats } from "@/lib/home/reviewBannerStats";
import { SeoCapeTownServicePage } from "@/components/seo/SeoCapeTownServicePage";
import type { CapeTownSeoServiceSlug } from "@/lib/seo/capeTownSeoPages";
import styles from "./PrimaryCapeTownServicePageTemplate.module.css";

export const PRIMARY_CAPE_TOWN_SERVICE_SLUGS = [
  "standard-cleaning-cape-town",
  "deep-cleaning-cape-town",
  "move-out-cleaning-cape-town",
  "airbnb-cleaning-cape-town",
  "office-cleaning-cape-town",
  "carpet-cleaning-cape-town",
] as const satisfies readonly CapeTownSeoServiceSlug[];

export type PrimaryCapeTownServiceSlug = (typeof PRIMARY_CAPE_TOWN_SERVICE_SLUGS)[number];

const PRIMARY_CAPE_TOWN_SERVICE_SLUG_SET = new Set<CapeTownSeoServiceSlug>(PRIMARY_CAPE_TOWN_SERVICE_SLUGS);

export function isPrimaryCapeTownServiceSlug(slug: CapeTownSeoServiceSlug): slug is PrimaryCapeTownServiceSlug {
  return PRIMARY_CAPE_TOWN_SERVICE_SLUG_SET.has(slug);
}

type Props = {
  slug: PrimaryCapeTownServiceSlug;
  trustStats: PublicReviewBannerStats | null;
  initialLocationSlug?: string | null;
};

/**
 * RD-PUBLIC-03 authority for the six primary Cape Town service pages.
 *
 * This typed boundary intentionally excludes Window Cleaning, which remains
 * a subordinate specialist guide rather than a seventh primary service.
 * The scoped presentation layer lets the six shared pages normalize against
 * the public marketing authority without changing the specialist renderer.
 */
export function PrimaryCapeTownServicePageTemplate(props: Props) {
  return (
    <div className={styles.primaryServicePage}>
      <SeoCapeTownServicePage {...props} />
    </div>
  );
}
