import type { Metadata } from "next";

/** Default for all public, indexable marketing and SEO routes (production HTML meta). Preview/staging also send `X-Robots-Tag` from `proxy.ts`. */
export const SEO_INDEX_FOLLOW: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
};

/** Thin taxonomy / shell URLs — keep follow for equity; drop index to reduce noise in GSC. */
export const SEO_NOINDEX_FOLLOW: NonNullable<Metadata["robots"]> = {
  index: false,
  follow: true,
};
