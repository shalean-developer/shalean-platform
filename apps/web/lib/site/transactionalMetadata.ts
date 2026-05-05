import type { Metadata } from "next";
import { canonicalUrl } from "@/lib/site/canonicalUrl";

/** Transactional flows: keep links crawlable; avoid indexing step URLs. */
export function noIndexFollowCanonical(path: `/${string}`): Metadata {
  return {
    robots: { index: false, follow: true },
    alternates: { canonical: canonicalUrl(path) },
  };
}

/** Auth / one-off tools: do not index or follow. */
export function noIndexNoFollowCanonical(path: `/${string}`): Metadata {
  return {
    robots: { index: false, follow: false },
    alternates: { canonical: canonicalUrl(path) },
  };
}
