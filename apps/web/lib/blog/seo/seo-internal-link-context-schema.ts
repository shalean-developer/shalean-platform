import { z } from "zod";

/** Stored JSON in blog_posts.seo_internal_link_context — matches inject-internal-links needs (minus related posts). */
export const seoInternalLinkContextSchema = z
  .object({
    location: z.string(),
    city: z.string(),
    service: z.string(),
    locationSlug: z.string().optional(),
    citySlug: z.string().optional(),
    serviceSlug: z.string().optional(),
  })
  .strict();

export type SeoInternalLinkContextStored = z.infer<typeof seoInternalLinkContextSchema>;

export function parseSeoInternalLinkContext(raw: unknown): SeoInternalLinkContextStored | null {
  const r = seoInternalLinkContextSchema.safeParse(raw);
  return r.success ? r.data : null;
}
