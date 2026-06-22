import Link from "next/link";
import type { ComponentProps } from "react";
import { noteEditorialHrefNormalized } from "@/lib/blog/editorialLinkObservability";
import { warnIfLikelyBrokenBlogHrefDev } from "@/lib/blog/blogStaticRoutableSlugs";
import { normalizeBlogHref } from "@/lib/blog/validBlogRoutes";
import { isSeoRebuildGonePath } from "@/lib/seo/seoRebuildPhase1";

export type SafeInternalLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  /** Passed through to dev-only blog governance warnings */
  linkContext?: string;
};

/**
 * Internal navigation with blog redirect canonicalization (matches `next.config` cleanup rules).
 * SSR-safe: normalization is sync and deterministic — no hydration mismatch.
 */
function pathnameFromInternalHref(href: string): string | null {
  if (href.startsWith("/")) {
    return href.split("?")[0]?.split("#")[0] ?? href;
  }
  try {
    return new URL(href).pathname;
  } catch {
    return null;
  }
}

export function SafeInternalLink({ href, linkContext, children, ...rest }: SafeInternalLinkProps) {
  const normalized = normalizeBlogHref(href);
  if (href !== normalized) noteEditorialHrefNormalized(href, normalized);
  warnIfLikelyBrokenBlogHrefDev(normalized, linkContext);
  const path = pathnameFromInternalHref(normalized);
  if (path && isSeoRebuildGonePath(path)) {
    return <span {...rest}>{children}</span>;
  }
  return (
    <Link href={normalized} {...rest}>
      {children}
    </Link>
  );
}
