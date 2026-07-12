"use client";

import { forwardRef } from "react";
import {
  LayoutFacebook,
  LayoutGoogle,
  LayoutInstagramFeed,
  LayoutLandscapeFallback,
  LayoutLinkedIn,
  LayoutPinterest,
  LayoutStory,
  LayoutTwitter,
} from "./social-design/layouts";
import type { SocialCreativeData, SocialLayoutVariant } from "./social-design/types";
import {
  SHALEAN_CAMPAIGN_ACCENT,
  SHALEAN_CAMPAIGN_ACCENT_SOFT,
  SHALEAN_CAMPAIGN_PRIMARY,
  SOCIAL_FONT_STACK,
  resolveBrandColors,
} from "./social-design/tokens";

export {
  SHALEAN_CAMPAIGN_PRIMARY,
  SHALEAN_CAMPAIGN_ACCENT,
  SHALEAN_CAMPAIGN_ACCENT_SOFT,
};

export type SocialImageCardProps = SocialCreativeData & {
  width: number;
  height: number;
  /** Scale down for on-screen preview (export uses full size via transform). */
  previewMaxWidth?: number;
};

function resolveLayoutVariant(format: string | null | undefined, width: number, height: number): SocialLayoutVariant {
  switch (format) {
    case "facebook_feed":
    case "widescreen_banner":
      return "facebook";
    case "instagram_feed":
      return "instagram_feed";
    case "instagram_portrait":
      return "instagram_feed";
    case "instagram_story":
    case "facebook_story":
      return "story";
    case "whatsapp_status":
      return "whatsapp";
    case "linkedin_banner":
      return "linkedin";
    case "twitter_image":
      return "twitter";
    case "pinterest_pin":
      return "pinterest";
    case "google_business_cover":
      return "google";
    default: {
      const ratio = height / width;
      if (ratio > 1.4) return "story";
      if (Math.abs(ratio - 1) < 0.08) return "instagram_feed";
      return "landscape";
    }
  }
}

function LayoutForVariant({
  variant,
  ...props
}: SocialCreativeData & {
  variant: SocialLayoutVariant;
  width: number;
  height: number;
  navy: string;
  blue: string;
}) {
  switch (variant) {
    case "facebook":
      return <LayoutFacebook {...props} />;
    case "instagram_feed":
      return <LayoutInstagramFeed {...props} />;
    case "story":
    case "whatsapp":
      return <LayoutStory {...props} />;
    case "linkedin":
      return <LayoutLinkedIn {...props} />;
    case "twitter":
      return <LayoutTwitter {...props} />;
    case "pinterest":
      return <LayoutPinterest {...props} />;
    case "google":
      return <LayoutGoogle {...props} />;
    default:
      return <LayoutLandscapeFallback {...props} />;
  }
}

/** Branded social creative — capture with html-to-image for PNG download / Facebook upload. */
export const SocialImageCard = forwardRef<HTMLDivElement, SocialImageCardProps>(
  function SocialImageCard(
    {
      width,
      height,
      brand = "Shalean",
      offer,
      headline,
      subheadline,
      promoCode,
      cta,
      primary = SHALEAN_CAMPAIGN_PRIMARY,
      accent = SHALEAN_CAMPAIGN_ACCENT,
      landing,
      format,
      heroImageUrl,
      logoUrl,
      endsAt,
      campaignName,
      ratingLabel,
      benefits,
      trustItems,
      badgeLabel,
      testimonial,
      testimonialAuthor,
      previewMaxWidth = 320,
    },
    ref,
  ) {
    const scale = Math.min(1, previewMaxWidth / width);
    const { navy, blue } = resolveBrandColors(primary, accent);
    const variant = resolveLayoutVariant(format, width, height);

    const creativeProps = {
      width,
      height,
      brand,
      offer,
      headline,
      subheadline,
      promoCode,
      cta,
      primary,
      accent,
      landing,
      format,
      heroImageUrl,
      logoUrl,
      endsAt,
      campaignName,
      ratingLabel,
      benefits,
      trustItems,
      badgeLabel,
      testimonial,
      testimonialAuthor,
      navy,
      blue,
    };

    return (
      <div
        className="relative overflow-hidden rounded-lg shadow-sm ring-1 ring-slate-200/80"
        style={{ width: width * scale, height: height * scale }}
      >
        <div
          ref={ref}
          data-social-card
          data-social-layout={variant}
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "relative",
            overflow: "hidden",
            color: "#fff",
            fontFamily: SOCIAL_FONT_STACK,
            boxSizing: "border-box",
            background: navy,
          }}
        >
          <LayoutForVariant variant={variant} {...creativeProps} />
        </div>
      </div>
    );
  },
);
