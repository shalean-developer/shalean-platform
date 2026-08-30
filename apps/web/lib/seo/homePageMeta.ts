import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { clipSerpTitle } from "@/lib/seo/metaTitle";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

export const HOME_OG_IMAGE = "/images/marketing/cape-town-house-cleaning-kitchen-og.webp";

/** Measured from `public/images/marketing/cape-town-house-cleaning-kitchen-og.webp` (1.91:1 social crop). */
export const HOME_OG_IMAGE_WIDTH = 1200;
export const HOME_OG_IMAGE_HEIGHT = 630;

export const HOME_OG_IMAGE_ALT = "Professional cleaning services in Cape Town";

/** Canonical marketing entry-price contract; runtime catalog drift is checked in `lib/home/data.ts`. */
export const HOME_STARTING_PRICE_ZAR = 250;

/** Primary keyword phrase — shared by `<title>`, `<h1>`, and JSON-LD WebPage name. */
export const HOME_PAGE_HEADLINE = `Cleaning Services Cape Town from R${HOME_STARTING_PRICE_ZAR}`;

/** SERP `<title>` — shorter than legacy; H1 + JSON-LD keep `HOME_PAGE_HEADLINE`. */
export const HOME_PAGE_TITLE = clipSerpTitle(`${HOME_PAGE_HEADLINE} | Shalean`);

export const HOME_PAGE_META_DESCRIPTION = clampMetaDescription(
  `Book vetted cleaning services in Cape Town from R${HOME_STARTING_PRICE_ZAR}. Compare home, deep, move, Airbnb, office and carpet cleaning and see your price before checkout.`,
);

export const HOME_CANONICAL = absoluteCanonicalUrl("/");

export const HOME_OPEN_GRAPH = {
  type: "website" as const,
  url: HOME_CANONICAL,
  siteName: "Shalean Cleaning Services",
  locale: "en_ZA",
  title: HOME_PAGE_TITLE,
  description: HOME_PAGE_META_DESCRIPTION,
  images: [
    {
      url: HOME_OG_IMAGE,
      width: HOME_OG_IMAGE_WIDTH,
      height: HOME_OG_IMAGE_HEIGHT,
      alt: HOME_OG_IMAGE_ALT,
    },
  ],
};

export const HOME_TWITTER = {
  card: "summary_large_image" as const,
  title: HOME_PAGE_TITLE,
  description: HOME_PAGE_META_DESCRIPTION,
  images: [HOME_OG_IMAGE],
};
