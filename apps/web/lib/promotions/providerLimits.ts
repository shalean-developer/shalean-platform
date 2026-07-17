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
} as const;

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
    args.channel !== "instagram"
  ) {
    return { ok: false, error: "One-click publish is not available for this channel." };
  }

  const limits = PROVIDER_PUBLISH_LIMITS[args.channel];
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
    !args.hasPublicImageUrl
  ) {
    return {
      ok: false,
      error:
        "Instagram requires a public campaign asset image URL (data URLs are not supported).",
    };
  }
  return { ok: true };
}
