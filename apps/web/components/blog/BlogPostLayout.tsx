import type { ReactNode } from "react";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { BlogArticleFrame } from "./BlogArticleFrame";
import { BlogEngagementAnalytics } from "./BlogEngagementAnalytics";
import { BlogArticleEnhancements } from "./engine/BlogArticleEnhancements";
import { BlogLayout } from "./engine/BlogLayout";
import { BlogRelatedPostsGrid } from "./engine/BlogRelatedPostsGrid";
import { BlogShareBar } from "./engine/BlogShareBar";
import { BlogReadingProgressBar } from "./BlogReadingProgressBar";
import { BlogTableOfContentsInline, BlogTableOfContentsSidebar, BlogTocScrollHub } from "./BlogTableOfContents";
import type { BlogIndexPost } from "@/lib/blog/get-all-posts";
import type { BlogSidebarCategory, RelatedGridPost } from "@/lib/blog/get-blog-sidebar-data";
import type { BlogTocEntry } from "@/lib/blog/extract-blog-toc";

export type BlogPostLayoutProps = {
  breadcrumbCurrentLabel: string; h1: string; lede?: string; publishedAtIso: string; updatedAtIso?: string;
  readingTimeMinutes: number | null; hero: { src: string; alt: string } | null; children: ReactNode; trackingSlug: string;
  supplementalInternalLinks?: { label: string; href: string }[]; clusterRelatedGuidesSlot?: ReactNode;
  relatedLinksSlot?: ReactNode; belowArticleSlot?: ReactNode; showLayoutMidBanner?: boolean;
  sidebarCategories: BlogSidebarCategory[]; sidebarTrending: BlogIndexPost[]; relatedGridPosts: RelatedGridPost[];
  categorySlug?: string | null; categoryName?: string | null; tocEntries?: BlogTocEntry[] | null; isPreview?: boolean;
};

function formatDate(iso?: string): string | undefined {
  if (!iso || Number.isNaN(Date.parse(iso))) return undefined;
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "long", timeZone: "Africa/Johannesburg" }).format(new Date(iso));
}

/** Reading first: authored content and FAQ, one closing CTA and one related group. */
export function BlogPostLayout({ breadcrumbCurrentLabel, h1, lede, publishedAtIso, updatedAtIso, readingTimeMinutes, hero, children, trackingSlug, supplementalInternalLinks, clusterRelatedGuidesSlot, relatedLinksSlot, belowArticleSlot, relatedGridPosts, tocEntries, isPreview = false }: BlogPostLayoutProps) {
  const hasToc = Boolean(tocEntries && tocEntries.length >= 2);
  const related = [...new Map(relatedGridPosts.filter(post => post.slug !== trackingSlug).map(post => [post.slug, post])).values()].slice(0, 3);
  const relatedGroup = clusterRelatedGuidesSlot || relatedLinksSlot || (supplementalInternalLinks?.length ? <nav aria-label="Related guides" className="space-y-3 border-t pt-6"><h2 className="text-xl font-semibold">Related guides</h2><ul className="space-y-2">{supplementalInternalLinks.map(link => <li key={link.href}><SafeInternalLink href={link.href} className="text-blue-700 underline">{link.label}</SafeInternalLink></li>)}</ul></nav> : <BlogRelatedPostsGrid posts={related} />);
  return <>
    {!isPreview ? <><BlogArticleEnhancements /><BlogEngagementAnalytics slug={trackingSlug} />{hasToc || (readingTimeMinutes ?? 0) >= 6 ? <BlogReadingProgressBar /> : null}{hasToc ? <BlogTocScrollHub items={tocEntries!} /> : null}</> : null}
    <div className="bg-white py-8 lg:py-12">
      <BlogLayout main={<>
        <nav aria-label="Breadcrumb" className="mx-auto mb-8 max-w-[720px] text-sm text-zinc-500"><SafeInternalLink href="/">Home</SafeInternalLink><span className="mx-2" aria-hidden>/</span><SafeInternalLink href="/blog">Blog</SafeInternalLink><span className="mx-2" aria-hidden>/</span><span>{breadcrumbCurrentLabel}</span></nav>
        <BlogArticleFrame title={h1} excerpt={lede} hero={hero} publishedAt={formatDate(publishedAtIso)} updatedAt={updatedAtIso && Date.parse(updatedAtIso) > Date.parse(publishedAtIso) ? formatDate(updatedAtIso) : undefined} readingTimeMinutes={readingTimeMinutes} preview={isPreview} trackingSlug={trackingSlug}
          outline={hasToc ? <BlogTableOfContentsInline items={tocEntries!} trackingSlug={trackingSlug} /> : null}
          afterArticle={<div className="space-y-10 border-t pt-8"><BlogShareBar urlPath={`/blog/${trackingSlug}`} title={h1} />{relatedGroup}<SafeInternalLink href="/blog" className="block text-sm text-blue-700 underline">← All cleaning guides</SafeInternalLink></div>}>
          {children}
          {belowArticleSlot}
        </BlogArticleFrame>
      </>} sidebar={<div className="space-y-6 lg:sticky lg:top-28">{hasToc ? <BlogTableOfContentsSidebar items={tocEntries!} trackingSlug={trackingSlug} /> : null}<SafeInternalLink href="/blog" className="block text-sm font-medium text-blue-700">Browse all cleaning guides →</SafeInternalLink></div>} />
    </div>
  </>;
}
