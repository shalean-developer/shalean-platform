import type { Metadata } from "next";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";

/** Page-specific metadata for booking/auth routes; never include personal query parameters. */
export function buildTransactionalPageMetadata(input: {
  path: `/${string}`;
  title: string;
  description: string;
}): Metadata {
  const url = absoluteCanonicalUrl(input.path);
  return {
    title: input.title,
    description: input.description,
    robots: { index: false, follow: false },
    alternates: { canonical: url },
    openGraph: { type: "website", url, title: input.title, description: input.description },
    twitter: { card: "summary", title: input.title, description: input.description },
  };
}
