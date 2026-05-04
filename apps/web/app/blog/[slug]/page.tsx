import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogContextualServiceLinks } from "@/components/blog/BlogContextualServiceLinks";
import { BlogServiceLinks } from "@/components/blog/BlogServiceLinks";
import { BlogConversionMidBanner } from "@/components/blog/engine/BlogConversionMidBanner";
import { BlogDbArticleBody } from "@/components/blog/BlogDbArticleBody";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { HighConversionBlogTemplate } from "@/components/blog/HighConversionBlogTemplate";
import { ProgrammaticBlogTemplate } from "@/components/blog/ProgrammaticBlogTemplate";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { injectLocationHubSeoImages } from "@/lib/blog/injectLocationHubSeoImages";
import { stripFirstDuplicateFeaturedImage } from "@/lib/blog/stripDuplicateFeaturedImage";
import { BlogPostLayout } from "@/components/blog/BlogPostLayout";
import {
  absoluteUrlFromCanonicalPath,
  buildDbBlogGraphJsonLd,
  collectFaqItemsFromContent,
} from "@/lib/blog/db-blog-jsonld";
import { buildKeywordsPhrase, getPostBySlug, getPublishedBlogSlugs } from "@/lib/blog/get-post-by-slug";
import type { HighConversionBlogArticle } from "@/lib/blog/highConversionBlogArticle";
import { getHighConversionBlogPost, ROUTED_HIGH_CONVERSION_POSTS } from "@/lib/blog/highConversionPosts";
import {
  getProgrammaticFaqEntities,
  getProgrammaticPost,
  ROUTED_PROGRAMMATIC_POSTS,
  type ProgrammaticPost,
} from "@/lib/blog/programmaticPosts";
import { getBlogServiceType } from "@/lib/blog/getBlogServiceType";
import {
  enrichRelatedPostsForGrid,
  getBlogIndexPostsCached,
  getBlogSidebarCategories,
  indexPostsToRelatedGrid,
  pickTrendingSidebarPosts,
} from "@/lib/blog/get-blog-sidebar-data";
import { locationHubHrefFromPlaceName } from "@/lib/seo/location-hub-from-blog";

const SITE = "https://www.shalean.co.za";

function toAbsoluteAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${SITE}${path}`;
}

/** Publisher logo in JSON-LD (distinct from per-post hero art). */
const ORGANIZATION_LOGO_ABSOLUTE = `${SITE}/images/marketing/cape-town-house-cleaning-kitchen.webp`;

const PROGRAMMATIC_HERO_SRC = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

type Props = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const dbSlugs = await getPublishedBlogSlugs();
  const map = new Map<string, { slug: string }>();
  for (const slug of dbSlugs) map.set(slug, { slug });
  for (const post of ROUTED_HIGH_CONVERSION_POSTS) map.set(post.slug, { slug: post.slug });
  for (const post of ROUTED_PROGRAMMATIC_POSTS) map.set(post.slug, { slug: post.slug });
  return [...map.values()];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;

  const dbPost = await getPostBySlug(slug);
  if (dbPost) {
    const canonicalAbsolute = absoluteUrlFromCanonicalPath(dbPost.canonicalPath);
    const titleBase = dbPost.metaTitle?.trim() || dbPost.title;
    const description = dbPost.metaDescription?.trim() || dbPost.excerpt || dbPost.title;
    const heroSrc = dbPost.featuredImageUrl
      ? toAbsoluteAssetUrl(dbPost.featuredImageUrl)
      : `${SITE}${PROGRAMMATIC_HERO_SRC}`;
    const heroAlt = dbPost.featuredImageAlt?.trim() || dbPost.h1;
    const kwPhrase = buildKeywordsPhrase(dbPost);
    const keywords =
      kwPhrase != null
        ? kwPhrase
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined;
    return {
      title: `${titleBase} | Shalean Blog`,
      description,
      alternates: { canonical: canonicalAbsolute },
      ...(keywords && keywords.length > 0 ? { keywords } : {}),
      robots: dbPost.noindex ? { index: false, follow: true } : undefined,
      openGraph: {
        title: `${titleBase} | Shalean Blog`,
        description,
        url: canonicalAbsolute,
        type: "article",
        publishedTime: dbPost.publishedAt,
        modifiedTime: dbPost.updatedAt,
        images: [{ url: heroSrc, alt: heroAlt }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${titleBase} | Shalean Blog`,
        description,
        images: [heroSrc],
      },
    };
  }

  const hc = getHighConversionBlogPost(slug);
  if (hc) {
    const url = `${SITE}/blog/${hc.slug}`;
    const heroAbs = `${SITE}${hc.heroImage.src}`;
    return {
      title: `${hc.title} | Shalean Blog`,
      description: hc.description,
      alternates: { canonical: url },
      openGraph: {
        title: `${hc.title} | Shalean Blog`,
        description: hc.description,
        url,
        type: "article",
        publishedTime: hc.publishedAt,
        modifiedTime: hc.dateModified ?? hc.publishedAt,
        images: [{ url: heroAbs, alt: hc.heroImage.alt }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${hc.title} | Shalean Blog`,
        description: hc.description,
        images: [heroAbs],
      },
    };
  }

  const prog = getProgrammaticPost(slug);
  if (!prog) return { title: "Blog | Shalean" };

  const path = `/blog/${prog.slug}`;
  const url = `${SITE}${path}`;
  const heroOg = `${SITE}${PROGRAMMATIC_HERO_SRC}`;
  return {
    title: `${prog.title} | Shalean Blog`,
    description: prog.description,
    alternates: { canonical: url },
    keywords: [
      prog.primaryKeyword,
      prog.location ? `${prog.location} cleaning` : null,
      "Cape Town cleaning",
      "Shalean",
    ].filter((x): x is string => Boolean(x)),
    openGraph: {
      title: prog.title,
      description: prog.description,
      url,
      type: "article",
      publishedTime: prog.publishedAt,
      modifiedTime: prog.dateModified ?? prog.publishedAt,
      images: [{ url: heroOg, alt: `${prog.h1} — Shalean Cape Town` }],
    },
    twitter: {
      card: "summary_large_image",
      title: prog.title,
      description: prog.description,
      images: [heroOg],
    },
  };
}

function buildProgrammaticBlogPostingJsonLd(post: ProgrammaticPost) {
  const pageUrl = `${SITE}/blog/${post.slug}`;
  const heroAbsolute = `${SITE}${PROGRAMMATIC_HERO_SRC}`;
  const dateModified = post.dateModified ?? post.publishedAt;
  const locationKw = post.location ? `${post.location} cleaning Cape Town` : "Cape Town cleaning";
  const serviceKw =
    post.service === "local-guide"
      ? `${post.primaryKeyword}, Cape Town cleaning guide`
      : `${post.service} cleaning Cape Town`;
  const keywords = [post.primaryKeyword, locationKw, serviceKw, "Shalean", "Cape Town"].filter(Boolean).join(", ");

  return {
    "@type": "BlogPosting",
    headline: post.h1,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified,
    image: [heroAbsolute],
    keywords,
    articleSection: "Local cleaning guides",
    author: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
    },
    publisher: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
      url: SITE,
      logo: {
        "@type": "ImageObject",
        url: ORGANIZATION_LOGO_ABSOLUTE,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
  };
}

function buildBreadcrumbJsonLdProgrammatic(post: ProgrammaticPost) {
  const pageUrl = `${SITE}/blog/${post.slug}`;
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: SITE,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Blog",
        item: `${SITE}/blog`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: post.h1,
        item: pageUrl,
      },
    ],
  };
}

function buildProgrammaticFaqJsonLd(post: ProgrammaticPost) {
  return {
    "@type": "FAQPage",
    mainEntity: getProgrammaticFaqEntities(post).map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

function buildProgrammaticGraphJsonLd(post: ProgrammaticPost) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildProgrammaticBlogPostingJsonLd(post),
      buildBreadcrumbJsonLdProgrammatic(post),
      buildProgrammaticFaqJsonLd(post),
    ],
  };
}

function buildHighConversionBlogPostingJsonLd(post: HighConversionBlogArticle) {
  const pageUrl = `${SITE}/blog/${post.slug}`;
  const heroAbsolute = `${SITE}${post.heroImage.src}`;
  const dateModified = post.dateModified ?? post.publishedAt;
  return {
    "@type": "BlogPosting",
    headline: post.h1,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified,
    image: [heroAbsolute],
    keywords: "same day cleaning Cape Town, Shalean, home cleaning, deep cleaning",
    articleSection: "Cleaning guides",
    author: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
    },
    publisher: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
      url: SITE,
      logo: {
        "@type": "ImageObject",
        url: ORGANIZATION_LOGO_ABSOLUTE,
      },
    },
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": pageUrl,
    },
  };
}

function buildBreadcrumbJsonLdHighConversion(post: HighConversionBlogArticle) {
  const pageUrl = `${SITE}/blog/${post.slug}`;
  return {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
      { "@type": "ListItem", position: 3, name: post.h1, item: pageUrl },
    ],
  };
}

function buildHighConversionFaqJsonLd(post: HighConversionBlogArticle) {
  return {
    "@type": "FAQPage",
    mainEntity: post.faqs.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}

function buildHighConversionGraphJsonLd(post: HighConversionBlogArticle) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      buildHighConversionBlogPostingJsonLd(post),
      buildBreadcrumbJsonLdHighConversion(post),
      buildHighConversionFaqJsonLd(post),
    ],
  };
}

export default async function BlogPostPage({ params }: Props) {
  const { slug } = await params;

  const [indexPosts, sidebarCategories] = await Promise.all([
    getBlogIndexPostsCached(),
    getBlogSidebarCategories(),
  ]);
  const sidebarTrending = pickTrendingSidebarPosts(indexPosts, slug, 5);

  const dbPost = await getPostBySlug(slug);
  if (dbPost) {
    const pageUrl = absoluteUrlFromCanonicalPath(dbPost.canonicalPath);
    const heroSrcAbs = dbPost.featuredImageUrl
      ? toAbsoluteAssetUrl(dbPost.featuredImageUrl)
      : `${SITE}${PROGRAMMATIC_HERO_SRC}`;
    const faqItems = collectFaqItemsFromContent(dbPost.content);
    const kwPhrase = buildKeywordsPhrase(dbPost);
    const jsonLd = buildDbBlogGraphJsonLd({
      headline: dbPost.h1,
      description: dbPost.metaDescription?.trim() || dbPost.excerpt || dbPost.title,
      publishedAt: dbPost.publishedAt,
      dateModified: dbPost.updatedAt,
      pageUrl,
      imageUrls: [heroSrcAbs],
      faqItems,
      keywords: kwPhrase,
      articleSection: dbPost.categoryName,
    });
    const jsonLdStr = JSON.stringify(jsonLd).replace(/</g, "\\u003c");

    const hero =
      dbPost.featuredImageUrl != null && dbPost.featuredImageUrl !== ""
        ? {
            src: dbPost.featuredImageUrl,
            alt: dbPost.featuredImageAlt?.trim() || dbPost.h1,
          }
        : {
            src: PROGRAMMATIC_HERO_SRC,
            alt: `${dbPost.h1} — Shalean professional cleaning in Cape Town`,
          };

    const contentForRender = stripFirstDuplicateFeaturedImage(
      {
        ...dbPost.content,
        blocks: injectLocationHubSeoImages(dbPost.slug, dbPost.content.blocks),
      },
      hero.src,
    );

    const relatedGrid =
      dbPost.relatedPosts.length >= 2
        ? enrichRelatedPostsForGrid(dbPost.relatedPosts, indexPosts).slice(0, 6)
        : indexPostsToRelatedGrid(pickTrendingSidebarPosts(indexPosts, dbPost.slug, 6));

    return (
      <MarketingLayout>
        <main className="bg-white text-zinc-900">
          <GrowthTracking event="page_view" payload={{ page_type: "blog_post_db", slug: dbPost.slug }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

          <BlogPostLayout
            breadcrumbCurrentLabel={dbPost.title}
            h1={dbPost.h1}
            lede={dbPost.excerpt}
            publishedAtIso={dbPost.publishedAt}
            updatedAtIso={dbPost.updatedAt}
            readingTimeMinutes={dbPost.readingTimeMinutes}
            hero={hero}
            trackingSlug={dbPost.slug}
            categorySlug={dbPost.categorySlug}
            categoryName={dbPost.categoryName}
            sidebarCategories={sidebarCategories}
            sidebarTrending={sidebarTrending}
            relatedGridPosts={relatedGrid}
            showLayoutMidBanner={false}
          >
            <BlogDbArticleBody
              content={contentForRender}
              midArticleSlot={
                <section
                  className="not-prose space-y-10 border-t border-zinc-200 pt-10"
                  aria-label="Services, areas, and booking"
                >
                  <BlogConversionMidBanner trackingSlug={dbPost.slug} />
                  <BlogContextualServiceLinks embedded />
                  <BlogServiceLinks service={getBlogServiceType(dbPost.slug)} dense />
                  <RelatedLinks placement="blog" emphasizeLocalBooking />
                </section>
              }
            />
          </BlogPostLayout>
        </main>
      </MarketingLayout>
    );
  }

  const hc = getHighConversionBlogPost(slug);
  if (hc) {
    const jsonLdStr = JSON.stringify(buildHighConversionGraphJsonLd(hc)).replace(/</g, "\\u003c");
    const relatedGrid = indexPostsToRelatedGrid(pickTrendingSidebarPosts(indexPosts, hc.slug, 6));

    return (
      <MarketingLayout>
        <main className="bg-white text-zinc-900">
          <GrowthTracking event="page_view" payload={{ page_type: "blog_high_conversion", slug: hc.slug }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

          <BlogPostLayout
            breadcrumbCurrentLabel={hc.title}
            h1={hc.h1}
            lede={hc.description}
            publishedAtIso={hc.publishedAt}
            updatedAtIso={hc.dateModified}
            readingTimeMinutes={hc.readingTimeMinutes ?? 6}
            hero={{ src: hc.heroImage.src, alt: hc.heroImage.alt }}
            trackingSlug={hc.slug}
            sidebarCategories={sidebarCategories}
            sidebarTrending={sidebarTrending}
            relatedGridPosts={relatedGrid}
            relatedLinksSlot={<RelatedLinks placement="blog" />}
            belowArticleSlot={
              <>
                <BlogContextualServiceLinks />
                <BlogServiceLinks service={getBlogServiceType(hc.slug)} />
              </>
            }
          >
            <HighConversionBlogTemplate article={hc} />
          </BlogPostLayout>
        </main>
      </MarketingLayout>
    );
  }

  const prog = getProgrammaticPost(slug);
  if (!prog) notFound();

  const jsonLdStr = JSON.stringify(buildProgrammaticGraphJsonLd(prog)).replace(/</g, "\\u003c");
  const relatedGrid = indexPostsToRelatedGrid(pickTrendingSidebarPosts(indexPosts, prog.slug, 6));
  const programmaticHubHref = locationHubHrefFromPlaceName(prog.location);

  return (
    <MarketingLayout>
      <main className="bg-white text-zinc-900">
        <GrowthTracking event="page_view" payload={{ page_type: "blog_programmatic", slug: prog.slug }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

        <BlogPostLayout
          breadcrumbCurrentLabel={prog.title}
          h1={prog.h1}
          lede={prog.description}
          publishedAtIso={prog.publishedAt}
          updatedAtIso={prog.dateModified}
          readingTimeMinutes={5}
          hero={{
            src: PROGRAMMATIC_HERO_SRC,
            alt: `${prog.h1} — Shalean professional cleaning in Cape Town`,
          }}
          trackingSlug={prog.slug}
          sidebarCategories={sidebarCategories}
          sidebarTrending={sidebarTrending}
          relatedGridPosts={relatedGrid}
          supplementalInternalLinks={
            programmaticHubHref && prog.location
              ? [{ label: `Cleaning services in ${prog.location} (suburb hub)`, href: programmaticHubHref }]
              : undefined
          }
          relatedLinksSlot={<RelatedLinks placement="blog" />}
          belowArticleSlot={
            <>
              <BlogContextualServiceLinks />
              <BlogServiceLinks service={getBlogServiceType(prog.slug)} />
            </>
          }
        >
          <ProgrammaticBlogTemplate post={prog} />
        </BlogPostLayout>
      </main>
    </MarketingLayout>
  );
}
