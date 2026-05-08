import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { BlogContextualServiceLinks } from "@/components/blog/BlogContextualServiceLinks";
import { BlogServiceLinks } from "@/components/blog/BlogServiceLinks";
import { BlogConversionMidBanner } from "@/components/blog/engine/BlogConversionMidBanner";
import { BlogClusterRelatedGuides } from "@/components/blog/BlogClusterRelatedGuides";
import { BlogDbArticleBody } from "@/components/blog/BlogDbArticleBody";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { HighConversionBlogTemplate } from "@/components/blog/HighConversionBlogTemplate";
import { ProgrammaticBlogTemplate } from "@/components/blog/ProgrammaticBlogTemplate";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import { ANALYTICS_EVENTS } from "@/lib/analytics/userEventRegistry";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { injectLocationHubSeoImages } from "@/lib/blog/injectLocationHubSeoImages";
import { stripFirstDuplicateFeaturedImage } from "@/lib/blog/stripDuplicateFeaturedImage";
import { AirbnbHostGuideBlogTemplate } from "@/components/blog/AirbnbHostGuideBlogTemplate";
import { BlogPostLayout } from "@/components/blog/BlogPostLayout";
import { extractTocFromBlogBlocks, shouldShowBlogTableOfContents, type BlogTocEntry } from "@/lib/blog/extract-blog-toc";
import { getMergedBlogDisplayBlocks } from "@/lib/blog/partition-blog-blocks";
import {
  AIRBNB_HOST_GUIDE_POSTS,
  buildAirbnbHostGuideGraphJsonLd,
  getAirbnbHostGuidePost,
} from "@/lib/blog/airbnbHostGuidePosts";
import {
  absoluteUrlFromCanonicalPath,
  buildDbBlogGraphJsonLd,
  collectFaqItemsFromContent,
} from "@/lib/blog/db-blog-jsonld";
import {
  buildKeywordsPhrase,
  getPostBySlug,
  getPublishedBlogSlugs,
  type GetPostBySlugOptions,
} from "@/lib/blog/get-post-by-slug";
import type { HighConversionBlogArticle } from "@/lib/blog/highConversionBlogArticle";
import { getHighConversionBlogPost, ROUTED_HIGH_CONVERSION_POSTS } from "@/lib/blog/highConversionPosts";
import {
  getProgrammaticFaqEntities,
  getProgrammaticPost,
  ROUTED_PROGRAMMATIC_POSTS,
  type ProgrammaticPost,
} from "@/lib/blog/programmaticPosts";
import {
  buildArticleSchemaKeywords,
  buildHighConversionBlogPostingKeywordsString,
} from "@/lib/blog/seo/build-blog-posting-schema-keywords";
import { getBlogServiceType } from "@/lib/blog/getBlogServiceType";
import { fetchClusterRelatedGuidesForPost } from "@/lib/blog/fetch-cluster-related-guides";
import {
  enrichRelatedPostsForGrid,
  getBlogIndexPostsCached,
  getBlogSidebarCategories,
  indexPostsToRelatedGrid,
  pickTrendingSidebarPosts,
} from "@/lib/blog/get-blog-sidebar-data";
import { locationHubHrefFromPlaceName } from "@/lib/seo/location-hub-from-blog";
import { resolveBlogFeaturedAlt, resolveBlogFeaturedSrc } from "@/lib/blogImageMap";
import { clampMetaDescription, resolveBlogDbMetaDescription } from "@/lib/seo/metaDescription";
import { generateBlogArticleTitle } from "@/lib/seo/metaTitle";
import { SITE_ORIGIN as SITE } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";
import { getSupabaseServer } from "@/lib/supabase/server";

/** Preserve Next.js `notFound()` / `redirect()` errors inside broad try/catch wrappers. */
function isNextNavigationError(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const digest = String((err as { digest?: unknown }).digest ?? "");
  if (digest.startsWith("NEXT_NOT_FOUND") || digest.startsWith("NEXT_REDIRECT")) return true;
  const name = String((err as { name?: unknown }).name ?? "");
  if (name === "NEXT_NOT_FOUND" || name === "NEXT_REDIRECT") return true;
  return false;
}

function toAbsoluteAssetUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const path = url.startsWith("/") ? url : `/${url}`;
  return `${SITE}${path}`;
}

function safeJsonLdStringify(value: unknown, ctx: { kind: string; slug: string }): string {
  try {
    return JSON.stringify(value).replace(/</g, "\\u003c");
  } catch (err) {
    console.error("[blog] JSON-LD stringify failed — omitting graph", { ...ctx, err });
    return "{}";
  }
}

/** Publisher logo in JSON-LD (distinct from per-post hero art). */
const ORGANIZATION_LOGO_ABSOLUTE = `${SITE}/images/marketing/cape-town-house-cleaning-kitchen.webp`;

/** CMS-backed posts must not be SSG-only — new `blog_posts` rows appear without rebuild. */
export const dynamic = "force-dynamic";

/** Node runtime: `getPostBySlug` uses `node:crypto`; rich text HTML is sanitized with `sanitize-html` during SSR. */
export const runtime = "nodejs";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function previewTokenFromSearchParams(sp: Record<string, string | string[] | undefined>): string | undefined {
  const v = sp.preview;
  if (Array.isArray(v)) return v[0];
  return v;
}

function getPostOptsFromSearchParams(sp: Record<string, string | string[] | undefined>): GetPostBySlugOptions {
  const token = previewTokenFromSearchParams(sp);
  return token ? { previewToken: token } : {};
}

/** Set `BLOG_DEBUG_FETCH=1` on Vercel temporarily — logs slug branch + DB hit/miss without guessing in Observability. */
function blogRouteTrace(stage: string, payload: Record<string, unknown>) {
  if (process.env.BLOG_DEBUG_FETCH !== "1") return;
  console.log(`[blog/[slug]] trace:${stage}`, payload);
}

/** Coerce CMS strings so metadata never calls unsafe helpers on odd DB types. */
function safeBlogMetaText(primary: string | null | undefined, fallback: string): string {
  const p = typeof primary === "string" ? primary.trim() : "";
  if (p) return p;
  const f = typeof fallback === "string" ? fallback.trim() : "";
  return f || "Shalean Cleaning Services";
}

function isReasonableIsoDate(s: string | undefined): boolean {
  if (!s || typeof s !== "string") return false;
  const ms = Date.parse(s.trim());
  return Number.isFinite(ms);
}

export async function generateStaticParams() {
  const dbSlugs = await getPublishedBlogSlugs();
  const map = new Map<string, { slug: string }>();
  for (const slug of dbSlugs) map.set(slug, { slug });
  for (const post of ROUTED_HIGH_CONVERSION_POSTS) map.set(post.slug, { slug: post.slug });
  for (const post of ROUTED_PROGRAMMATIC_POSTS) map.set(post.slug, { slug: post.slug });
  for (const post of AIRBNB_HOST_GUIDE_POSTS) map.set(post.slug, { slug: post.slug });
  return [...map.values()];
}

async function buildBlogMetadataInner(props: Props): Promise<Metadata | null> {
  let slug: string;
  let sp: Record<string, string | string[] | undefined>;
  try {
    const p = await props.params;
    slug = typeof p.slug === "string" ? p.slug : "";
    sp = await props.searchParams;
  } catch (paramErr) {
    console.error("❌ buildBlogMetadata: await params/searchParams failed — using fallback metadata", paramErr);
    return null;
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[blog/[slug] generateMetadata] slug:", JSON.stringify(slug), "preview:", previewTokenFromSearchParams(sp) ?? "(none)");
  }

  blogRouteTrace("generateMetadata_pre_fetch", { slug });
  const dbPost = await getPostBySlug(slug, getPostOptsFromSearchParams(sp));
  blogRouteTrace("generateMetadata_post_fetch", { slug, dbHit: Boolean(dbPost), id: dbPost?.id });
  if (dbPost) {
    try {
      const canonicalAbsolute = absoluteUrlFromCanonicalPath(dbPost.canonicalPath);
      const titleBase = safeBlogMetaText(dbPost.metaTitle, safeBlogMetaText(dbPost.title, "Blog"));
      const description = resolveBlogDbMetaDescription({
        metaTitle: dbPost.metaTitle,
        title: dbPost.title,
        metaDescription: dbPost.metaDescription,
        excerpt: dbPost.excerpt,
      });
      const heroSrc = toAbsoluteAssetUrl(dbPost.featuredImageUrl);
      const heroAlt = safeBlogMetaText(dbPost.featuredImageAlt, safeBlogMetaText(dbPost.h1, titleBase));
      const kwPhrase = buildKeywordsPhrase(dbPost);
      const keywords =
        kwPhrase != null
          ? kwPhrase
              .split(",")
              .map((s) => s.trim())
              .filter(Boolean)
          : undefined;
      const pubOk = isReasonableIsoDate(dbPost.publishedAt);
      const modOk = isReasonableIsoDate(dbPost.updatedAt);
      const pageTitle = generateBlogArticleTitle({
        headline: titleBase,
        slugKey: dbPost.slug,
      });
      return {
        title: pageTitle,
        description,
        alternates: { canonical: canonicalAbsolute },
        ...(keywords && keywords.length > 0 ? { keywords } : {}),
        robots: dbPost.indexedForSearch ? SEO_INDEX_FOLLOW : { index: false, follow: true },
        openGraph: {
          title: pageTitle,
          description,
          url: canonicalAbsolute,
          type: "article",
          ...(pubOk ? { publishedTime: dbPost.publishedAt } : {}),
          ...(modOk ? { modifiedTime: dbPost.updatedAt } : {}),
          images: [{ url: heroSrc, alt: heroAlt }],
        },
        twitter: {
          card: "summary_large_image",
          title: pageTitle,
          description,
          images: [heroSrc],
        },
      };
    } catch (err) {
      if (isNextNavigationError(err)) throw err;
      console.error("❌ METADATA DB BRANCH:", { slug: dbPost.slug, err });
      return null;
    }
  }

  const hc = getHighConversionBlogPost(slug);
  if (hc) {
    const url = `${SITE}/blog/${hc.slug}`;
    const heroPath = resolveBlogFeaturedSrc(hc.slug);
    const heroAbs = `${SITE}${heroPath}`;
    const heroAlt = resolveBlogFeaturedAlt(hc.slug);
    const description = clampMetaDescription(hc.description);
    const pageTitle = generateBlogArticleTitle({ headline: hc.title, slugKey: hc.slug });
    const kw = buildHighConversionBlogPostingKeywordsString(hc);
    const metaKeywords = kw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title: pageTitle,
      description,
      robots: SEO_INDEX_FOLLOW,
      alternates: { canonical: url },
      ...(metaKeywords.length > 0 ? { keywords: metaKeywords } : {}),
      openGraph: {
        title: pageTitle,
        description,
        url,
        type: "article",
        publishedTime: hc.publishedAt,
        modifiedTime: hc.dateModified ?? hc.publishedAt,
        images: [{ url: heroAbs, alt: heroAlt }],
      },
      twitter: {
        card: "summary_large_image",
        title: pageTitle,
        description,
        images: [heroAbs],
      },
    };
  }

  const hostGuide = getAirbnbHostGuidePost(slug);
  if (hostGuide) {
    const path = `/blog/${hostGuide.slug}`;
    const url = `${SITE}${path}`;
    const heroPath = resolveBlogFeaturedSrc(hostGuide.slug);
    const heroOg = `${SITE}${heroPath}`;
    const heroOgAlt = resolveBlogFeaturedAlt(hostGuide.slug);
    const description = clampMetaDescription(hostGuide.description);
    const pageTitle = generateBlogArticleTitle({ headline: hostGuide.title, slugKey: hostGuide.slug });
    const hostKw = buildArticleSchemaKeywords({
      primary: hostGuide.primaryKeyword,
      secondary: [
        ...(hostGuide.secondaryKeywords ?? []),
        "Airbnb short-term rental",
        "turnover cleaning",
        hostGuide.title,
      ],
      localModifiers: [...(hostGuide.localSeoModifiers ?? []), "Airbnb Cape Town"],
      intentModifiers: hostGuide.searchIntentModifiers ?? ["hosting operations", "guest-ready cleaning"],
    });
    const metaKeywords = hostKw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return {
      title: pageTitle,
      description,
      robots: SEO_INDEX_FOLLOW,
      alternates: { canonical: url },
      keywords: metaKeywords,
      openGraph: {
        title: pageTitle,
        description,
        url,
        type: "article",
        publishedTime: hostGuide.publishedAt,
        modifiedTime: hostGuide.dateModified,
        images: [{ url: heroOg, alt: heroOgAlt }],
      },
      twitter: {
        card: "summary_large_image",
        title: pageTitle,
        description,
        images: [heroOg],
      },
    };
  }

  const prog = getProgrammaticPost(slug);
  if (!prog) {
    if (process.env.NODE_ENV === "development") {
      console.log("[blog/[slug] generateMetadata] notFound(): draft DB posts need ?preview=true in dev — slug:", JSON.stringify(slug));
    }
    return notFound();
  }

  const path = `/blog/${prog.slug}`;
  const url = `${SITE}${path}`;
  const heroPath = resolveBlogFeaturedSrc(prog.slug);
  const heroOg = `${SITE}${heroPath}`;
  const heroOgAlt = resolveBlogFeaturedAlt(prog.slug);
  const description = clampMetaDescription(prog.description);
  const pageTitle = generateBlogArticleTitle({ headline: prog.title, slugKey: prog.slug });
  return {
    title: pageTitle,
    description,
    robots: SEO_INDEX_FOLLOW,
    alternates: { canonical: url },
    keywords: [
      prog.primaryKeyword,
      prog.location ? `${prog.location} cleaning` : null,
      "Cape Town cleaning",
      "Shalean",
    ].filter((x): x is string => Boolean(x)),
    openGraph: {
      title: pageTitle,
      description,
      url,
      type: "article",
      publishedTime: prog.publishedAt,
      modifiedTime: prog.dateModified ?? prog.publishedAt,
      images: [{ url: heroOg, alt: heroOgAlt }],
    },
    twitter: {
      card: "summary_large_image",
      title: pageTitle,
      description,
      images: [heroOg],
    },
  };
}

/**
 * Last-resort metadata only — **plain strings**, no helpers, so this object never throws during evaluation
 * or when returned from `generateMetadata` after an unexpected error.
 */
const STATIC_BLOG_METADATA_FALLBACK: Metadata = {
  title: "Cleaning guides & tips | Shalean",
  description:
    "Shalean Cleaning Services — trusted home cleaning in Cape Town. Book vetted cleaners with instant pricing.",
  robots: SEO_INDEX_FOLLOW,
};

async function buildBlogMetadata(props: Props): Promise<Metadata | null> {
  try {
    return await buildBlogMetadataInner(props);
  } catch (err) {
    if (isNextNavigationError(err)) throw err;
    console.error("❌ buildBlogMetadata: unexpected error — fallback metadata", err);
    return null;
  }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  try {
    const data = await buildBlogMetadata(props);
    return data ?? STATIC_BLOG_METADATA_FALLBACK;
  } catch (err) {
    if (isNextNavigationError(err)) throw err;
    console.error("❌ METADATA CRASH (outer) — static fallback", err);
    return STATIC_BLOG_METADATA_FALLBACK;
  }
}

function buildProgrammaticBlogPostingJsonLd(post: ProgrammaticPost) {
  const pageUrl = `${SITE}/blog/${post.slug}`;
  const heroAbsolute = `${SITE}${resolveBlogFeaturedSrc(post.slug)}`;
  const dateModified = post.dateModified ?? post.publishedAt;
  const locationKw = post.location ? `${post.location} cleaning Cape Town` : "Cape Town cleaning";
  const serviceKw =
    post.service === "local-guide"
      ? `${post.primaryKeyword}, Cape Town cleaning guide`
      : `${post.service} cleaning Cape Town`;
  const keywords = [post.primaryKeyword, locationKw, serviceKw, "Shalean", "Cape Town"].filter(Boolean).join(", ");

  return {
    "@type": ["BlogPosting", "Article"],
    headline: post.h1,
    description: clampMetaDescription(post.description),
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
  const heroAbsolute = `${SITE}${resolveBlogFeaturedSrc(post.slug)}`;
  const dateModified = post.dateModified ?? post.publishedAt;
  const keywords = buildHighConversionBlogPostingKeywordsString(post);
  return {
    "@type": ["BlogPosting", "Article"],
    headline: post.h1,
    description: clampMetaDescription(post.description),
    datePublished: post.publishedAt,
    dateModified,
    image: [heroAbsolute],
    keywords,
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

async function BlogPostPageImpl(props: Props) {
  let slug: string;
  let sp: Record<string, string | string[] | undefined>;
  try {
    const p = await props.params;
    slug = typeof p.slug === "string" ? p.slug : "";
    sp = await props.searchParams;
  } catch (paramErr) {
    console.error("[blog/[slug]] await params/searchParams failed — notFound", paramErr);
    return notFound();
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[blog/[slug]] PARAM SLUG:", JSON.stringify(slug));
    console.log("[blog/[slug]] SEARCH PARAMS:", JSON.stringify(sp));
    console.log("[blog/[slug]] preview token:", previewTokenFromSearchParams(sp) ?? "(none)");
  }

  let indexPosts: Awaited<ReturnType<typeof getBlogIndexPostsCached>> = [];
  let sidebarCategories: Awaited<ReturnType<typeof getBlogSidebarCategories>> = [];
  try {
    const pair = await Promise.all([getBlogIndexPostsCached(), getBlogSidebarCategories()]);
    indexPosts = pair[0];
    sidebarCategories = pair[1];
  } catch (err) {
    console.error("[blog/[slug]] index/sidebar bootstrap failed — rendering with empty sidebar data", { slug, err });
  }
  const sidebarTrending = pickTrendingSidebarPosts(indexPosts, slug, 5);

  blogRouteTrace("page_pre_fetch", { slug });
  const dbPost = await getPostBySlug(slug, getPostOptsFromSearchParams(sp));
  blogRouteTrace("page_post_fetch", {
    slug,
    dbHit: Boolean(dbPost),
    id: dbPost?.id,
    blockCount: Array.isArray(dbPost?.content?.blocks) ? dbPost.content.blocks.length : 0,
  });
  if (process.env.NODE_ENV === "development") {
    console.log("[blog/[slug]] POST BEFORE BRANCH (dbPost):", dbPost ? `hit id=${dbPost.id} status=${dbPost.dbStatus}` : "null");
  }
  if (dbPost) {
    try {
      if (process.env.NODE_ENV === "development") {
        const types = Array.isArray(dbPost.content?.blocks)
          ? dbPost.content.blocks.map((b) => b.type)
          : [];
        console.log(
          "POST DATA:",
          JSON.stringify(
            {
              id: dbPost.id,
              slug: dbPost.slug,
              title: dbPost.title,
              dbStatus: dbPost.dbStatus,
              hasContentJson: Boolean(dbPost.content),
              blockCount: dbPost.content?.blocks?.length ?? 0,
              blockTypes: types,
            },
            null,
            2,
          ),
        );
      }

      if (
        dbPost.content !== null &&
        typeof dbPost.content === "object" &&
        dbPost.content !== undefined &&
        !Array.isArray((dbPost.content as { blocks?: unknown }).blocks)
      ) {
        console.error("[blog] Invalid blog content_json.blocks — expected array", {
          slug: dbPost.slug,
          id: dbPost.id,
        });
      }
      const safeBlocks = Array.isArray(dbPost.content?.blocks) ? dbPost.content.blocks : [];
      if (safeBlocks.length === 0) {
        console.warn("[blog] DB post has empty blocks — rendering shell only", { slug: dbPost.slug, id: dbPost.id });
      }
      const contentSafe = { ...dbPost.content, blocks: safeBlocks };

      const pageUrl = absoluteUrlFromCanonicalPath(dbPost.canonicalPath);
      const heroSrcAbs = toAbsoluteAssetUrl(dbPost.featuredImageUrl);

      let faqItems: ReturnType<typeof collectFaqItemsFromContent> = [];
      try {
        faqItems = collectFaqItemsFromContent(contentSafe);
      } catch (err) {
        console.error("[blog] collectFaqItemsFromContent failed", { slug: dbPost.slug, err });
      }

      const kwPhrase = buildKeywordsPhrase(dbPost);
      const jsonLd = buildDbBlogGraphJsonLd({
        headline: dbPost.h1,
        description: resolveBlogDbMetaDescription({
          metaTitle: dbPost.metaTitle,
          title: dbPost.title,
          metaDescription: dbPost.metaDescription,
          excerpt: dbPost.excerpt,
        }),
        publishedAt: dbPost.publishedAt,
        dateModified: dbPost.updatedAt,
        pageUrl,
        imageUrls: [heroSrcAbs],
        faqItems,
        keywords: kwPhrase,
        articleSection: dbPost.categoryName,
      });
      const jsonLdStr = safeJsonLdStringify(jsonLd, { kind: "db", slug: dbPost.slug });

      const hero = {
        src: dbPost.featuredImageUrl,
        alt: (dbPost.featuredImageAlt ?? "").trim() || dbPost.h1,
      };

      let injectedBlocks = safeBlocks;
      try {
        injectedBlocks = injectLocationHubSeoImages(dbPost.slug, safeBlocks);
      } catch (err) {
        console.error("[blog] injectLocationHubSeoImages failed", { slug: dbPost.slug, err });
      }

      let contentForRender = { ...contentSafe, blocks: injectedBlocks };
      try {
        contentForRender = stripFirstDuplicateFeaturedImage(contentForRender, hero.src);
      } catch (stripErr) {
        console.error("[blog] stripFirstDuplicateFeaturedImage failed — using unstripped blocks", {
          slug: dbPost.slug,
          stripErr,
        });
      }

      let relatedGrid = indexPostsToRelatedGrid(pickTrendingSidebarPosts(indexPosts, dbPost.slug, 6));
      try {
        const related = Array.isArray(dbPost.relatedPosts) ? dbPost.relatedPosts : [];
        if (related.length >= 2) {
          relatedGrid = enrichRelatedPostsForGrid(related, indexPosts).slice(0, 6);
        }
      } catch (err) {
        console.error("[blog] related grid enrichment failed", { slug: dbPost.slug, err });
      }

      let clusterRelatedGuidesSlot: ReactNode = null;
      const supabase = getSupabaseServer();
      if (supabase) {
        try {
          const guides = await fetchClusterRelatedGuidesForPost(supabase, {
            currentSlug: dbPost.slug,
            semanticClusterPersisted: dbPost.semanticCluster,
            tagSlugs: dbPost.tagSlugs,
            manualRelatedOverrides: dbPost.relatedGuideOverrideSlugs,
            publishedBeforeIso: new Date().toISOString(),
          });
          if (guides.length > 0) {
            clusterRelatedGuidesSlot = <BlogClusterRelatedGuides items={guides} />;
          }
        } catch (err) {
          console.error("[blog] cluster related guides failed", { slug: dbPost.slug, err });
        }
      }

      let tocEntries: BlogTocEntry[] | undefined;
      try {
        const merged = getMergedBlogDisplayBlocks(contentForRender);
        const raw = extractTocFromBlogBlocks(merged);
        tocEntries = shouldShowBlogTableOfContents(raw, dbPost.readingTimeMinutes) ? raw : undefined;
      } catch (tocErr) {
        console.error("[blog] TOC extraction failed", { slug: dbPost.slug, tocErr });
        tocEntries = undefined;
      }

      return (
        <MarketingLayout>
          <main className="bg-white text-zinc-900">
            <GrowthTracking event={ANALYTICS_EVENTS.PAGE_VIEW} payload={{ page_type: "blog_post_db", slug: dbPost.slug }} />
            <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

            {dbPost.dbStatus === "draft" || dbPost.dbStatus === "scheduled" ? (
              <div
                className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-center text-sm font-medium text-amber-950"
                role="status"
              >
                Unpublished preview — not indexed until published. Dev:{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">?preview=true</code> · Prod:{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">?preview=…</code> using{" "}
                <code className="rounded bg-amber-100 px-1 py-0.5 text-xs">BLOG_DRAFT_PREVIEW_TOKEN</code>.
              </div>
            ) : null}

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
              clusterRelatedGuidesSlot={clusterRelatedGuidesSlot}
              showLayoutMidBanner={false}
              tocEntries={tocEntries}
            >
              <BlogDbArticleBody
                content={contentForRender}
                autoLinkSlug={dbPost.slug}
                midArticleSlot={
                  <section
                    className="not-prose space-y-8 border-t border-zinc-200/80 pt-8 sm:space-y-9 sm:pt-9"
                    aria-label="Services, areas, and booking"
                  >
                    <BlogConversionMidBanner trackingSlug={dbPost.slug} />
                    <BlogContextualServiceLinks embedded />
                    <BlogServiceLinks trackingSlug={dbPost.slug} service={getBlogServiceType(dbPost.slug)} dense />
                    <RelatedLinks placement="blog" emphasizeLocalBooking />
                  </section>
                }
              />
            </BlogPostLayout>
          </main>
        </MarketingLayout>
      );
    } catch (err) {
      if (isNextNavigationError(err)) throw err;
      console.error("❌ BLOG DB PAGE ERROR:", { slug: dbPost.slug, id: dbPost.id, err });
      return notFound();
    }
  }

  const hc = getHighConversionBlogPost(slug);
  if (hc) {
    const jsonLdStr = safeJsonLdStringify(buildHighConversionGraphJsonLd(hc), { kind: "high_conversion", slug: hc.slug });
    const relatedGrid = indexPostsToRelatedGrid(pickTrendingSidebarPosts(indexPosts, hc.slug, 6));

    return (
      <MarketingLayout>
        <main className="bg-white text-zinc-900">
          <GrowthTracking event={ANALYTICS_EVENTS.PAGE_VIEW} payload={{ page_type: "blog_high_conversion", slug: hc.slug }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

          <BlogPostLayout
            breadcrumbCurrentLabel={hc.title}
            h1={hc.h1}
            lede={hc.description}
            publishedAtIso={hc.publishedAt}
            updatedAtIso={hc.dateModified}
            readingTimeMinutes={hc.readingTimeMinutes ?? 6}
            hero={{ src: resolveBlogFeaturedSrc(hc.slug), alt: resolveBlogFeaturedAlt(hc.slug) }}
            trackingSlug={hc.slug}
            sidebarCategories={sidebarCategories}
            sidebarTrending={sidebarTrending}
            relatedGridPosts={relatedGrid}
            relatedLinksSlot={<RelatedLinks placement="blog" />}
            belowArticleSlot={
              <>
                <BlogContextualServiceLinks />
                <BlogServiceLinks trackingSlug={hc.slug} service={getBlogServiceType(hc.slug)} />
              </>
            }
          >
            <HighConversionBlogTemplate article={hc} />
          </BlogPostLayout>
        </main>
      </MarketingLayout>
    );
  }

  const hostGuide = getAirbnbHostGuidePost(slug);
  if (hostGuide) {
    const jsonLdStr = safeJsonLdStringify(buildAirbnbHostGuideGraphJsonLd(hostGuide, SITE, resolveBlogFeaturedSrc(hostGuide.slug)), {
      kind: "airbnb_host_guide",
      slug: hostGuide.slug,
    });
    const relatedGrid = indexPostsToRelatedGrid(pickTrendingSidebarPosts(indexPosts, hostGuide.slug, 6));

    return (
      <MarketingLayout>
        <main className="bg-white text-zinc-900">
          <GrowthTracking event={ANALYTICS_EVENTS.PAGE_VIEW} payload={{ page_type: "blog_airbnb_host_guide", slug: hostGuide.slug }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

          <BlogPostLayout
            breadcrumbCurrentLabel={hostGuide.title}
            h1={hostGuide.h1}
            lede={hostGuide.description}
            publishedAtIso={hostGuide.publishedAt}
            updatedAtIso={hostGuide.dateModified}
            readingTimeMinutes={hostGuide.readingTimeMinutes}
            hero={{
              src: resolveBlogFeaturedSrc(hostGuide.slug),
              alt: resolveBlogFeaturedAlt(hostGuide.slug),
            }}
            trackingSlug={hostGuide.slug}
            sidebarCategories={sidebarCategories}
            sidebarTrending={sidebarTrending}
            relatedGridPosts={relatedGrid}
            relatedLinksSlot={<RelatedLinks placement="blog" />}
            belowArticleSlot={
              <>
                <BlogContextualServiceLinks />
                <BlogServiceLinks trackingSlug={hostGuide.slug} service={getBlogServiceType(hostGuide.slug)} />
              </>
            }
          >
            <AirbnbHostGuideBlogTemplate post={hostGuide} />
          </BlogPostLayout>
        </main>
      </MarketingLayout>
    );
  }

  const prog = getProgrammaticPost(slug);
  if (!prog) {
    if (process.env.NODE_ENV === "development") {
      console.log(
        "[blog/[slug]] notFound(): no DB post (see getPostBySlug), no HC/airbnb slug match, programmatic miss for slug:",
        JSON.stringify(slug),
      );
    }
    return notFound();
  }

  const jsonLdStr = safeJsonLdStringify(buildProgrammaticGraphJsonLd(prog), { kind: "programmatic", slug: prog.slug });
  const relatedGrid = indexPostsToRelatedGrid(pickTrendingSidebarPosts(indexPosts, prog.slug, 6));
  const programmaticHubHref = locationHubHrefFromPlaceName(prog.location);

  return (
    <MarketingLayout>
      <main className="bg-white text-zinc-900">
        <GrowthTracking event={ANALYTICS_EVENTS.PAGE_VIEW} payload={{ page_type: "blog_programmatic", slug: prog.slug }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

        <BlogPostLayout
          breadcrumbCurrentLabel={prog.title}
          h1={prog.h1}
          lede={prog.description}
          publishedAtIso={prog.publishedAt}
          updatedAtIso={prog.dateModified}
          readingTimeMinutes={5}
          hero={{
            src: resolveBlogFeaturedSrc(prog.slug),
            alt: resolveBlogFeaturedAlt(prog.slug),
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
              <BlogServiceLinks trackingSlug={prog.slug} service={getBlogServiceType(prog.slug)} />
            </>
          }
        >
          <ProgrammaticBlogTemplate post={prog} />
        </BlogPostLayout>
      </main>
    </MarketingLayout>
  );
}

export default async function BlogPostPage(props: Props) {
  try {
    return await BlogPostPageImpl(props);
  } catch (err) {
    if (isNextNavigationError(err)) throw err;
    console.error("❌ PAGE CRASH:", err);
    return notFound();
  }
}
