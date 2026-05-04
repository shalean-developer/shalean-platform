import Link from "next/link";
import type { ReactNode } from "react";
import { BlogArticleEndCta } from "@/components/blog/BlogArticleConversionBlocks";
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
import { StickyBookingCta } from "@/components/blog/StickyBookingCta";
import type { BlogIndexPost } from "@/lib/blog/get-all-posts";
import type { BlogSidebarCategory, RelatedGridPost } from "@/lib/blog/get-blog-sidebar-data";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

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
  relatedLinksSlot?: ReactNode;
  belowArticleSlot?: ReactNode;
  /** Emerald banner between article body and share (off when banner is injected inside DB body). */
  showLayoutMidBanner?: boolean;
  sidebarCategories: BlogSidebarCategory[];
  sidebarTrending: BlogIndexPost[];
  relatedGridPosts: RelatedGridPost[];
  categorySlug?: string | null;
  categoryName?: string | null;
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
  relatedLinksSlot,
  belowArticleSlot,
  showLayoutMidBanner = true,
  sidebarCategories,
  sidebarTrending,
  relatedGridPosts,
  categorySlug,
  categoryName,
}: BlogPostLayoutProps) {
  const readLabel =
    readingTimeMinutes != null && readingTimeMinutes > 0
      ? `${readingTimeMinutes} min read`
      : null;

  const publishedLabel = new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "long",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(publishedAtIso));

  const publishedMs = new Date(publishedAtIso).getTime();
  const updatedMs = updatedAtIso ? new Date(updatedAtIso).getTime() : NaN;
  const showUpdated =
    updatedAtIso != null &&
    updatedAtIso !== "" &&
    !Number.isNaN(updatedMs) &&
    updatedMs > publishedMs;

  const updatedLabel =
    showUpdated && updatedAtIso
      ? new Intl.DateTimeFormat("en-ZA", {
          dateStyle: "long",
          timeZone: "Africa/Johannesburg",
        }).format(new Date(updatedAtIso))
      : null;

  return (
    <>
      <BlogArticleEnhancements />
      <BlogEngagementAnalytics slug={trackingSlug} />
      <StickyBookingCta trackingSlug={trackingSlug} />

      <div className="bg-gradient-to-b from-zinc-50/90 via-white to-white pb-16 pt-8 lg:pb-24 lg:pt-10">
        <BlogLayout
          main={
            <article data-blog-article-root className="space-y-8">
              <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
                <Link href="/" className={cn(linkInNavClassName, "text-sm")}>
                  Home
                </Link>
                <span className="mx-2 text-zinc-400" aria-hidden>
                  /
                </span>
                <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
                  Blog
                </Link>
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
                      <Link
                        href={`/blog/category/${categorySlug}`}
                        className="text-blue-700 underline-offset-4 hover:underline"
                      >
                        {categoryName}
                      </Link>
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
              </header>

              <BlogContent prose={false}>{children}</BlogContent>

              {showLayoutMidBanner ? <BlogConversionMidBanner trackingSlug={trackingSlug} /> : null}

              <BlogShareBar urlPath={`/blog/${trackingSlug}`} title={h1} />

              {belowArticleSlot ? <div className="not-prose space-y-12">{belowArticleSlot}</div> : null}

              {supplementalInternalLinks && supplementalInternalLinks.length > 0 ? (
                <nav className="not-prose border-t border-zinc-200/90 pt-10" aria-label="Related guides">
                  <h2 className="text-lg font-semibold text-zinc-900">Related on this site</h2>
                  <ul className="mt-4 space-y-2">
                    {supplementalInternalLinks.map((l) => (
                      <li key={l.href + l.label}>
                        <Link
                          href={l.href}
                          className="text-base font-medium text-blue-700 underline-offset-4 hover:text-blue-900 hover:underline"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </nav>
              ) : null}

              {relatedLinksSlot ? <div className="not-prose mt-12">{relatedLinksSlot}</div> : null}

              <BlogRelatedPostsGrid posts={relatedGridPosts} className="mt-4" />

              <BlogPreFooterTrust />

              <BlogArticleEndCta trackingSlug={trackingSlug} />

              <footer className="not-prose border-t border-zinc-200/90 pt-10 text-center">
                <p className="text-sm text-zinc-500">
                  <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
                    ← Back to all articles
                  </Link>
                </p>
                <p className="mt-6 text-sm text-zinc-500">
                  <Link href="/locations/cape-town-cleaning-services" className={linkInNavClassName}>
                    Cape Town service areas
                  </Link>
                  {" · "}
                  <Link href="/booking" className={linkInNavClassName}>
                    Book cleaning
                  </Link>
                </p>
              </footer>
            </article>
          }
          sidebar={
            <BlogSidebar
              categories={sidebarCategories}
              trending={sidebarTrending}
              trackingSlug={trackingSlug}
            />
          }
        />
      </div>
    </>
  );
}
