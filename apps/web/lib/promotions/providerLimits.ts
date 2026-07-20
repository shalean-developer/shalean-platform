/**
 * MKT-001D — Client-safe publish limits (mirrors SocialProvider capabilities).
 * Do not import server-only provider modules into client components.
 */

export const PROVIDER_PUBLISH_LIMITS = {
  facebook: {
    characterLimit: 63_206,
    requiresImage: false,
    label: "Facebook",
  },
  google_business: {
    characterLimit: 1500,
    requiresImage: true,
    label: "Google Business",
  },
  instagram: {
    characterLimit: 2200,
    requiresImage: true,
    requiresPublicImageUrl: true,
    label: "Instagram",
  },
  twitter: {
    characterLimit: 280,
    requiresImage: false,
    label: "X",
  },
} as const;

/** Public branded image Meta can fetch for Instagram when no custom upload is attached. */
export const SHALEAN_BRANDED_INSTAGRAM_IMAGE_URL =
  "https://shalean.co.za/images/marketing/shalean-cleaner-balcony-cape-town.webp";

export function resolveInstagramPublishImageUrl(
  assetImageUrl: string | null | undefined,
): string | null {
  const url = assetImageUrl?.trim() ?? "";
  if (url && /^https?:\/\//i.test(url) && !url.startsWith("data:")) {
    return url;
  }
  return SHALEAN_BRANDED_INSTAGRAM_IMAGE_URL;
}

export type PublishableChannel = keyof typeof PROVIDER_PUBLISH_LIMITS;

export function validatePublishPayloadClient(args: {
  channel: string;
  message: string;
  hasImage: boolean;
  hasPublicImageUrl?: boolean;
}): { ok: true } | { ok: false; error: string } {
  const message = args.message?.trim() ?? "";
  if (!message) {
    return { ok: false, error: "Caption is empty." };
  }

  if (
    args.channel !== "facebook" &&
    args.channel !== "google_business" &&
    args.channel !== "instagram" &&
    args.channel !== "twitter"
  ) {
    return { ok: false, error: "One-click publish is not available for this channel." };
  }

  const limits = PROVIDER_PUBLISH_LIMITS[args.channel as PublishableChannel];
  if (message.length > limits.characterLimit) {
    return {
      ok: false,
      error: `Caption exceeds ${limits.label} limit (${limits.characterLimit.toLocaleString()} characters).`,
    };
  }
  if (limits.requiresImage && !args.hasImage) {
    return {
      ok: false,
      error: `An image is required to publish to ${limits.label}.`,
    };
  }
  if (
    "requiresPublicImageUrl" in limits &&
    limits.requiresPublicImageUrl &&
    !args.hasPublicImageUrl &&
    args.channel !== "instagram"
  ) {
    return {
      ok: false,
      error:
        "Instagram requires a public campaign asset image URL (data URLs are not supported).",
    };
  }
  return { ok: true };
}
