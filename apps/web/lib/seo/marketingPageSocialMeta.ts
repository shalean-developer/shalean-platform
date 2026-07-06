import type { Metadata } from "next";
import {
  HOME_OG_IMAGE,
  HOME_OG_IMAGE_ALT,
  HOME_OG_IMAGE_HEIGHT,
  HOME_OG_IMAGE_WIDTH,
} from "@/lib/seo/homePageMeta";

/** Shared OpenGraph + Twitter card for marketing/legal pages without a dedicated social crop. */
export function buildMarketingSocialMetadata(params: {
  url: string;
  title: string;
  description: string;
  imageAlt?: string;
}): Pick<Metadata, "openGraph" | "twitter"> {
  const alt = params.imageAlt ?? HOME_OG_IMAGE_ALT;
  return {
    openGraph: {
      type: "website",
      url: params.url,
      locale: "en_ZA",
      siteName: "Shalean Cleaning Services",
      title: params.title,
      description: params.description,
      images: [
        {
          url: HOME_OG_IMAGE,
          width: HOME_OG_IMAGE_WIDTH,
          height: HOME_OG_IMAGE_HEIGHT,
          alt,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: params.title,
      description: params.description,
      images: [HOME_OG_IMAGE],
    },
  };
}
