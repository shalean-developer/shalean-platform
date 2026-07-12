export type SocialTrustItem = {
  icon: "★" | "✓" | "●";
  label: string;
};

export type SocialLayoutVariant =
  | "facebook"
  | "instagram_feed"
  | "story"
  | "linkedin"
  | "twitter"
  | "whatsapp"
  | "pinterest"
  | "google"
  | "landscape";

export type SocialCreativeData = {
  brand: string;
  offer: string;
  headline: string;
  subheadline?: string | null;
  promoCode?: string | null;
  cta?: string | null;
  primary?: string;
  accent?: string;
  landing?: string | null;
  format?: string | null;
  heroImageUrl?: string | null;
  logoUrl?: string | null;
  endsAt?: string | null;
  campaignName?: string | null;
  ratingLabel?: string | null;
  benefits?: string[] | null;
  trustItems?: SocialTrustItem[] | null;
  badgeLabel?: string | null;
  testimonial?: string | null;
  testimonialAuthor?: string | null;
};

export type SocialLayoutProps = SocialCreativeData & {
  width: number;
  height: number;
  navy: string;
  blue: string;
};
