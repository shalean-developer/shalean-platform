import type { CampaignAssetType } from "@/lib/promotions/campaignChannels";

/** Lifestyle photography pool for social creatives (same-origin public assets). */
export const SOCIAL_HERO_IMAGES = {
  livingRoom: "/images/marketing/bright-living-room-after-cleaning-cape-town.webp",
  kitchen: "/images/marketing/deep-cleaning-cape-town-kitchen.webp",
  bathroom: "/images/marketing/bathroom-kitchen-deep-clean-cape-town.webp",
  cleaner: "/images/marketing/professional-cleaner-cape-town.webp",
  team: "/images/marketing/cleaning-team-bright-space-cape-town.webp",
  balcony: "/images/marketing/shalean-cleaner-balcony-cape-town.webp",
  airbnb: "/images/marketing/airbnb-cleaning-cape-town-living-room.webp",
  office: "/images/marketing/office-cleaning-cape-town-workspace.webp",
  house: "/images/marketing/house-deep-cleaning-cape-town.webp",
  sofa: "/images/marketing/sofa-carpet-care-cape-town.webp",
  logo: "/images/shalean-logo.png",
} as const;

const FORMAT_HERO: Partial<Record<CampaignAssetType, string>> = {
  facebook_feed: SOCIAL_HERO_IMAGES.livingRoom,
  instagram_feed: SOCIAL_HERO_IMAGES.kitchen,
  instagram_portrait: SOCIAL_HERO_IMAGES.livingRoom,
  instagram_story: SOCIAL_HERO_IMAGES.livingRoom,
  facebook_story: SOCIAL_HERO_IMAGES.balcony,
  whatsapp_status: SOCIAL_HERO_IMAGES.team,
  linkedin_banner: SOCIAL_HERO_IMAGES.livingRoom,
  twitter_image: SOCIAL_HERO_IMAGES.cleaner,
  pinterest_pin: SOCIAL_HERO_IMAGES.airbnb,
  google_business_cover: SOCIAL_HERO_IMAGES.house,
  widescreen_banner: SOCIAL_HERO_IMAGES.livingRoom,
};

/** Secondary lifestyle image for magazine / multi-panel layouts. */
const FORMAT_SECONDARY: Partial<Record<CampaignAssetType, string>> = {
  pinterest_pin: SOCIAL_HERO_IMAGES.kitchen,
  facebook_feed: SOCIAL_HERO_IMAGES.kitchen,
  linkedin_banner: SOCIAL_HERO_IMAGES.kitchen,
};

export function resolveHeroImage(
  format: string | undefined,
  override?: string | null,
): string {
  if (override?.trim()) return override.trim();
  if (format && FORMAT_HERO[format as CampaignAssetType]) {
    return FORMAT_HERO[format as CampaignAssetType]!;
  }
  return SOCIAL_HERO_IMAGES.livingRoom;
}

export function resolveSecondaryImage(
  format: string | undefined,
  override?: string | null,
): string {
  if (override?.trim()) return override.trim();
  if (format && FORMAT_SECONDARY[format as CampaignAssetType]) {
    return FORMAT_SECONDARY[format as CampaignAssetType]!;
  }
  return SOCIAL_HERO_IMAGES.bathroom;
}
