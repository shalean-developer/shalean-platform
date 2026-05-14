import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import type { ReactNode } from "react";
import { BlogArticleEndCta } from "@/components/blog/BlogArticleConversionBlocks";
import { BlogLocationBookCta } from "@/components/blog/BlogLocationBookCta";
import { BlogAuthorityHubStrip } from "@/components/blog/BlogAuthorityHubStrip";
import { BlogIntroServiceLink } from "@/components/blog/BlogIntroServiceLink";
import { BlogEngagementAnalytics } from "@/components/blog/BlogEngagementAnalytics";
import { BlogPreFooterTrust } from "@/components/blog/BlogPreFooterTrust";
import { BlogArticleEnhancements } from "@/components/blog/engine/BlogArticleEnhancements";
import { BlogContent } from "@/components/blog/engine/BlogContent";
import { BlogConversionMidBanner } from "@/components/blog/engine/BlogConversionMidBanner";
import { BlogHero } from "@/components/blog/engine/BlogHero";
import { BlogLayout } from "@/components/blog/engine/BlogLayout";
import { BlogRelatedPostsGrid } from "@/components/blog/engine/BlogRelatedPostsGrid";
import { BlogShareBar } from "@/components/blog/engine/BlogShareBar";
import { BlogSidebar } from "@/components/blog/engine/BlogSidebar";
import { BlogReadingProgressBar } from "@/components/blog/BlogReadingProgressBar";
import {
  BlogTableOfContentsInline,
  BlogTableOfContentsSidebar,
  BlogTocScrollHub,
} from "@/components/blog/BlogTableOfContents";
import { SeoInternalLinksBlock } from "@/components/seo/SeoInternalLinksBlock";
import { StickyBookingCta } from "@/components/blog/StickyBookingCta";
import type { BlogIndexPost } from "@/lib/blog/get-all-posts";
import type { BlogSidebarCategory, RelatedGridPost } from "@/lib/blog/get-blog-sidebar-data";
import type { BlogTocEntry } from "@/lib/blog/extract-blog-toc";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const ZA_LONG_DATE: Intl.DateTimeFormatOptions = {
  dateStyle: "long",
  timeZone: "Africa/Johannesburg",
};

/** `Intl.DateTimeFormat#format` throws RangeError on Invalid Date — CMS rows must never take down the page. */
function formatZaLongDate(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  try {
    return new Intl.DateTimeFormat("en-ZA", ZA_LONG_DATE).format(new Date(ms));
  } catch {
    return "—";
  }
}

export type BlogPostLayoutProps = {
  breadcrumbCurrentLabel: string;
  h1: string;
  lede?: string;
  publishedAtIso: string;
  updatedAtIso?: string;
  readingTimeMinutes: number | null;
  hero: { src: string; alt: string } | null;
  children: ReactNode;
  trackingSlug: string;
  supplementalInternalLinks?: { label: string; href: string }[];
  /** Cluster-native related guides (semantic_cluster + peers + optional overrides). */
  clusterRelatedGuidesSlot?: ReactNode;
  relatedLinksSlot?: ReactNode;
  belowArticleSlot?: ReactNode;
  /** Emerald banner between article body and share (off when banner is injected inside DB body). */
  showLayoutMidBanner?: boolean;
  sidebarCategories: BlogSidebarCategory[];
  sidebarTrending: BlogIndexPost[];
  relatedGridPosts: RelatedGridPost[];
  categorySlug?: string | null;
  categoryName?: string | null;
  /** DB long-form: heading-derived TOC (mobile inline + desktop sidebar). Omit on short posts. */
  tocEntries?: BlogTocEntry[] | null;
};

export function BlogPostLayout({
  breadcrumbCurrentLabel,
  h1,
  lede,
  publishedAtIso,
  updatedAtIso,
  readingTimeMinutes,
  hero,
  children,
  trackingSlug,
  supplementalInternalLinks,
  clusterRelatedGuidesSlot,
  relatedLinksSlot,
  belowArticleSlot,
  showLayoutMidBanner = true,
  sidebarCategories,
  sidebarTrending,
  relatedGridPosts,
  categorySlug,
  categoryName,
  tocEntries,
}: BlogPostLayoutProps) {
  const readLabel =
    readingTimeMinutes != null && readingTimeMinutes > 0
      ? `${readingTimeMinutes} min read`
      : null;

  const publishedLabel = formatZaLongDate(publishedAtIso);

  const publishedMs = Date.parse(publishedAtIso);
  const updatedMs = updatedAtIso ? Date.parse(updatedAtIso) : NaN;
  const showUpdated =
    updatedAtIso != null &&
    updatedAtIso !== "" &&
    !Number.isNaN(publishedMs) &&
    !Number.isNaN(updatedMs) &&
    updatedMs > publishedMs;

  const updatedLabel = showUpdated && updatedAtIso ? formatZaLongDate(updatedAtIso) : null;

  const showReadingProgressBar =
    (tocEntries != null && tocEntries.length >= 2) || (readingTimeMinutes ?? 0) >= 6;

  return (
    <>
      {showReadingProgressBar ? <BlogReadingProgressBar /> : null}
      <BlogArticleEnhancements />
      <BlogEngagementAnalytics slug={trackingSlug} />
      <StickyBookingCta trackingSlug={trackingSlug} />
      {tocEntries && tocEntries.length >= 2 ? <BlogTocScrollHub items={tocEntries} /> : null}

      <div className="bg-gradient-to-b from-zinc-50/90 via-white to-white pb-16 pt-8 lg:pb-24 lg:pt-10">
        <BlogLayout
          main={
            <article data-blog-article-root className="space-y-8">
              <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
                <SafeInternalLink href="/" className={cn(linkInNavClassName, "text-sm")}>
                  Home
                </SafeInternalLink>
                <span className="mx-2 text-zinc-400" aria-hidden>
                  /
                </span>
                <SafeInternalLink href="/blog" className={cn(linkInNavClassName, "text-sm")} linkContext="blog layout crumb">
                  Blog
                </SafeInternalLink>
                <span className="mx-2 text-zinc-400" aria-hidden>
                  /
                </span>
                <span className="text-zinc-700">{breadcrumbCurrentLabel}</span>
              </nav>

              {hero ? <BlogHero src={hero.src} alt={hero.alt} /> : null}

              <header className="space-y-4 border-b border-zinc-200/90 pb-8">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-zinc-500">
                  {readLabel ? <span className="font-medium text-blue-800">{readLabel}</span> : null}
                  {readLabel ? <span aria-hidden className="text-zinc-300">·</span> : null}
                  <span>Published {publishedLabel}</span>
                  {showUpdated && updatedLabel ? (
                    <>
                      <span aria-hidden className="text-zinc-300">
                        ·
                      </span>
                      <span className="text-zinc-600">Updated {updatedLabel}</span>
                    </>
                  ) : null}
                </div>

                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Shalean · Cape Town
                  {categoryName && categorySlug ? (
                    <>
                      {" "}
                      ·{" "}
                      <SafeInternalLink
                        href={`/blog/category/${categorySlug}`}
                        className="text-blue-700 underline-offset-4 hover:underline"
                        linkContext="blog layout category"
                      >
                        {categoryName}
                      </SafeInternalLink>
                    </>
                  ) : categoryName ? (
                    <>
                      {" "}
                      · <span className="text-zinc-600">{categoryName}</span>
                    </>
                  ) : null}
                </p>

                <h1 className="text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.35rem] lg:leading-[1.12]">
                  {h1}
                </h1>

                {lede ? (
                  <p className="text-lg leading-relaxed text-zinc-600 sm:text-[1.125rem]">{lede}</p>
                ) : null}
                <BlogIntroServiceLink slug={trackingSlug} />
                <BlogAuthorityHubStrip slug={trackingSlug} />
              </header>

              {tocEntries && tocEntries.length >= 2 ? (
                <BlogTableOfContentsInline
                  items={tocEntries}
                  trackingSlug={trackingSlug}
                  className="not-prose"
                />
              ) : null}

              <BlogContent prose>{children}</BlogContent>

              {showLayoutMidBanner ? <BlogConversionMidBanner trackingSlug={trackingSlug} /> : null}

              <BlogShareBar urlPath={`/blog/${trackingSlug}`} title={h1} />

              {belowArticleSlot ? <div className="not-prose space-y-12">{belowArticleSlot}</div> : null}

              {supplementalInternalLinks && supplementalInternalLinks.length > 0 ? (
                <nav className="not-prose border-t border-zinc-200/90 pt-10" aria-label="Related guides">
                  <h2 className="text-lg font-semibold text-zinc-900">Related on this site</h2>
                  <ul className="mt-4 space-y-2">
                    {supplementalInternalLinks.map((l) => (
                      <li key={l.href + l.label}>
                        <SafeInternalLink
                          href={l.href}
                          className="text-base font-medium text-blue-700 underline-offset-4 hover:text-blue-900 hover:underline"
                          linkContext="blog supplemental internal"
                        >
                          {l.label}
                        </SafeInternalLink>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}

              {clusterRelatedGuidesSlot ? <div className="not-prose mt-12">{clusterRelatedGuidesSlot}</div> : null}

              {relatedLinksSlot ? <div className="not-prose mt-12">{relatedLinksSlot}</div> : null}

              <BlogRelatedPostsGrid posts={relatedGridPosts} className="mt-4" />

              <div className="not-prose mt-12">
                <SeoInternalLinksBlock
                  title="Book with Shalean"
                  className="rounded-2xl border border-zinc-200 bg-zinc-50/90 p-6"
                />
              </div>

              <BlogLocationBookCta trackingSlug={trackingSlug} />

              <BlogPreFooterTrust />

              <BlogArticleEndCta trackingSlug={trackingSlug} />

              <footer className="not-prose border-t border-zinc-200/90 pt-10 text-center">
                <p className="text-sm text-zinc-500">
                  <SafeInternalLink href="/blog" className={cn(linkInNavClassName, "text-sm")} linkContext="blog footer">
                    ← Back to all articles
                  </SafeInternalLink>
                </p>
                <p className="mt-6 text-sm text-zinc-500">
                  <SafeInternalLink href="/cleaning-services-cape-town" className={linkInNavClassName}>
                    Cape Town service areas
                  </SafeInternalLink>
                  {" · "}
                  <SafeInternalLink href="/booking" className={linkInNavClassName}>
                    Book cleaning
                  </SafeInternalLink>
                </p>
              </footer>
            </article>
          }
          sidebar={
            <div className="space-y-6 lg:sticky lg:top-24 lg:self-start">
              {tocEntries && tocEntries.length >= 2 ? (
                <BlogTableOfContentsSidebar
                  items={tocEntries}
                  trackingSlug={trackingSlug}
                  className="not-prose"
                />
              ) : null}
              <BlogSidebar
                categories={sidebarCategories}
                trending={sidebarTrending}
                trackingSlug={trackingSlug}
              />
            </div>
          }
        />
      </div>
    </>
  );
}
