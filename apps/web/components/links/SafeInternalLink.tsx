import Link from "next/link";
import type { ComponentProps } from "react";
import { noteEditorialHrefNormalized } from "@/lib/blog/editorialLinkObservability";
import { warnIfLikelyBrokenBlogHrefDev } from "@/lib/blog/blogStaticRoutableSlugs";
import { normalizeBlogHref } from "@/lib/blog/validBlogRoutes";

export type SafeInternalLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** Passed through to dev-only blog governance warnings */
  linkContext?: string;
};

/**
 * Internal navigation with blog redirect canonicalization (matches `next.config` cleanup rules).
 * SSR-safe: normalization is sync and deterministic — no hydration mismatch.
 */
export function SafeInternalLink({ href, linkContext, ...rest }: SafeInternalLinkProps) {
  const normalized = normalizeBlogHref(href);
  if (href !== normalized) noteEditorialHrefNormalized(href, normalized);
  warnIfLikelyBrokenBlogHrefDev(normalized, linkContext);
  return <Link href={normalized} {...rest} />;
}
