import type { Metadata } from "next";

/** Default for all public, indexable marketing and SEO routes (production HTML meta). Preview/staging still uses `X-Robots-Tag` from middleware. */
export const SEO_INDEX_FOLLOW: NonNullable<Metadata["robots"]> = {
  index: true,
  follow: true,
};
