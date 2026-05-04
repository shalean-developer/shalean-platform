/**
 * Marketing copy for `/about` — align operational stats with finance/ops before changing magnitudes.
 */

export const ABOUT_FOUNDING_YEAR = 2022;

/** Highlighted weekly cleans figure (also referenced on legacy marketing about UI). */
export const ABOUT_WEEKLY_HOMES_CLEANED_DISPLAY = "4,500+";

export type AboutReview = {
  quote: string;
  author: string;
  initials: string;
  suburb: string;
};

export const ABOUT_REVIEWS: readonly AboutReview[] = [
  {
    quote:
      "Shalean completely transformed my apartment in Claremont. Professional, fast, and every detail mattered—it felt like a brand-new home.",
    author: "Sarah M.",
    initials: "SM",
    suburb: "Claremont",
  },
  {
    quote:
      "Transparent pricing before they arrived, and the Sea Point team navigated our lift and parking without fuss. We book recurring now.",
    author: "James K.",
    initials: "JK",
    suburb: "Sea Point",
  },
  {
    quote:
      "Deep clean before handover in Rondebosch—the ovens and bathrooms were inspection-ready. Worth every rand.",
    author: "Nadia P.",
    initials: "NP",
    suburb: "Rondebosch",
  },
];
