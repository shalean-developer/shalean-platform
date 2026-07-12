/** Marketing channels supported by the campaign content engine. */

export const CAMPAIGN_CONTENT_CHANNELS = [
  "facebook",
  "instagram",
  "linkedin",
  "twitter",
  "whatsapp",
  "google_business",
  "email",
  "sms",
  "blog",
  "landing",
  "faq",
  "meta_seo",
  "pinterest",
] as const;

export type CampaignContentChannel = (typeof CAMPAIGN_CONTENT_CHANNELS)[number];

export const CAMPAIGN_ASSET_TYPES = [
  "facebook_feed",
  "instagram_feed",
  "instagram_portrait",
  "instagram_story",
  "facebook_story",
  "whatsapp_status",
  "linkedin_banner",
  "twitter_image",
  "pinterest_pin",
  "google_business_cover",
  "widescreen_banner",
  "qr_code",
  "hero",
  "banner",
  "logo",
  "other",
] as const;

export type CampaignAssetType = (typeof CAMPAIGN_ASSET_TYPES)[number];

export const SOCIAL_IMAGE_SPECS: {
  assetType: CampaignAssetType;
  label: string;
  width: number;
  height: number;
}[] = [
  { assetType: "facebook_feed", label: "Facebook Feed", width: 1200, height: 630 },
  { assetType: "instagram_feed", label: "Instagram Feed", width: 1080, height: 1080 },
  { assetType: "instagram_portrait", label: "Instagram Portrait", width: 1080, height: 1350 },
  { assetType: "instagram_story", label: "Instagram Story", width: 1080, height: 1920 },
  { assetType: "facebook_story", label: "Facebook Story", width: 1080, height: 1920 },
  { assetType: "whatsapp_status", label: "WhatsApp Status", width: 1080, height: 1920 },
  { assetType: "linkedin_banner", label: "LinkedIn Banner", width: 1200, height: 627 },
  { assetType: "twitter_image", label: "X Image", width: 1200, height: 675 },
  { assetType: "pinterest_pin", label: "Pinterest Pin", width: 1000, height: 1500 },
  { assetType: "google_business_cover", label: "Google Business Cover", width: 1024, height: 576 },
  { assetType: "widescreen_banner", label: "Widescreen Banner", width: 1600, height: 900 },
];

export const CHANNEL_LABELS: Record<CampaignContentChannel, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  linkedin: "LinkedIn",
  twitter: "X (Twitter)",
  whatsapp: "WhatsApp",
  google_business: "Google Business",
  email: "Email",
  sms: "SMS",
  blog: "Blog",
  landing: "Landing Page",
  faq: "FAQ",
  meta_seo: "Meta / SEO",
  pinterest: "Pinterest",
};
