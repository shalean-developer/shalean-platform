import type { Metadata } from "next";
import type { ComponentType } from "react";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogContextualServiceLinks } from "@/components/blog/BlogContextualServiceLinks";
import { BlogServiceLinks } from "@/components/blog/BlogServiceLinks";
import { BlogPostGlobalSections } from "@/components/blog/BlogPostGlobalSections";
import { BlogArticleEndCta } from "@/components/blog/BlogArticleConversionBlocks";
import { RelatedLinks } from "@/components/seo/RelatedLinks";
import { BlogRelatedGuidesSection } from "@/components/blog/BlogRelatedGuidesSection";
import { HighConversionBlogTemplate } from "@/components/blog/HighConversionBlogTemplate";
import { ProgrammaticBlogTemplate } from "@/components/blog/ProgrammaticBlogTemplate";
import { AirbnbCleaningChecklistPost } from "@/components/blog/posts/AirbnbCleaningChecklistPost";
import { CleaningCostCapeTownPost } from "@/components/blog/posts/CleaningCostCapeTownPost";
import { MoveOutCleaningGuidePost } from "@/components/blog/posts/MoveOutCleaningGuidePost";
import { DeepVsStandardCleaningCapeTownPost } from "@/components/blog/posts/DeepVsStandardCleaningCapeTownPost";
import { GrowthTracking } from "@/components/growth/GrowthTracking";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import type { HighConversionBlogArticle } from "@/lib/blog/highConversionBlogArticle";
import {
  getHighConversionBlogPost,
  HIGH_CONVERSION_POSTS,
} from "@/lib/blog/highConversionPosts";
import {
  getProgrammaticFaqEntities,
  getProgrammaticPost,
  PROGRAMMATIC_POSTS,
  type ProgrammaticPost,
} from "@/lib/blog/programmaticPosts";
import { getBlogServiceType } from "@/lib/blog/getBlogServiceType";
import { BLOG_POST_SLUGS, type BlogPostSlug, getBlogPost } from "@/lib/blog/posts";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const SITE = "https://www.shalean.co.za";

const POST_BODIES: Record<BlogPostSlug, ComponentType> = {
  "airbnb-cleaning-checklist": AirbnbCleaningChecklistPost,
  "cleaning-cost-cape-town": CleaningCostCapeTownPost,
  "move-out-cleaning-guide": MoveOutCleaningGuidePost,
  "deep-vs-standard-cleaning-cape-town": DeepVsStandardCleaningCapeTownPost,
};

/** Publisher logo in JSON-LD (distinct from per-post hero art). */
const ORGANIZATION_LOGO_ABSOLUTE = `${SITE}/images/marketing/cape-town-house-cleaning-kitchen.webp`;

const PROGRAMMATIC_HERO_SRC = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return [
    ...BLOG_POST_SLUGS.map((slug) => ({ slug })),
    ...HIGH_CONVERSION_POSTS.map((post) => ({ slug: post.slug })),
    ...PROGRAMMATIC_POSTS.map((post) => ({ slug: post.slug })),
  ];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const editorial = getBlogPost(slug);
  if (editorial) {
    const path = `/blog/${editorial.slug}`;
    const url = `${SITE}${path}`;
    return {
      title: `${editorial.title} | Shalean Blog`,
      description: editorial.description,
      alternates: { canonical: path },
      openGraph: {
        title: editorial.title,
        description: editorial.description,
        url,
        type: "article",
        publishedTime: editorial.publishedAt,
        images: [{ url: editorial.heroImage.src, alt: editorial.heroImage.alt }],
      },
      twitter: {
        card: "summary_large_image",
        title: editorial.title,
        description: editorial.description,
        images: [editorial.heroImage.src],
      },
    };
  }

  const hc = getHighConversionBlogPost(slug);
  if (hc) {
    const path = `/blog/${hc.slug}`;
    const url = `${SITE}${path}`;
    const heroAbs = `${SITE}${hc.heroImage.src}`;
    return {
      title: `${hc.title} | Shalean Blog`,
      description: hc.description,
      alternates: { canonical: path },
      openGraph: {
        title: `${hc.title} | Shalean Blog`,
        description: hc.description,
        url,
        type: "article",
        publishedTime: hc.publishedAt,
        modifiedTime: hc.dateModified ?? hc.publishedAt,
        images: [{ url: hc.heroImage.src, alt: hc.heroImage.alt }],
      },
      twitter: {
        card: "summary_large_image",
        title: `${hc.title} | Shalean Blog`,
        description: hc.description,
        images: [hc.heroImage.src],
      },
    };
  }

  const prog = getProgrammaticPost(slug);
  if (!prog) return { title: "Blog | Shalean" };

  const path = `/blog/${prog.slug}`;
  const url = `${SITE}${path}`;
  return {
    title: `${prog.title} | Shalean Blog`,
    description: prog.description,
    alternates: { canonical: path },
    openGraph: {
      title: prog.title,
      description: prog.description,
      url,
      type: "article",
      publishedTime: prog.publishedAt,
      modifiedTime: prog.dateModified ?? prog.publishedAt,
      images: [{ url: PROGRAMMATIC_HERO_SRC, alt: `${prog.h1} — Shalean Cape Town` }],
    },
    twitter: {
      card: "summary_large_image",
      title: prog.title,
      description: prog.description,
      images: [PROGRAMMATIC_HERO_SRC],
    },
  };
}

function buildBlogArticleJsonLd(post: NonNullable<ReturnType<typeof getBlogPost>>) {
  const pageUrl = `${SITE}/blog/${post.slug}`;
  const heroAbsolute = `${SITE}${post.heroImage.src}`;
  const dateModified = post.dateModified ?? post.publishedAt;

  return {
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.publishedAt,
    dateModified,
    image: [heroAbsolute],
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

function buildBreadcrumbJsonLdArticle(post: NonNullable<ReturnType<typeof getBlogPost>>) {
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
        name: post.title,
        item: pageUrl,
      },
    ],
  };
}

function buildBlogPostGraphJsonLd(post: NonNullable<ReturnType<typeof getBlogPost>>) {
  return {
    "@context": "https://schema.org",
    "@graph": [buildBlogArticleJsonLd(post), buildBreadcrumbJsonLdArticle(post)],
  };
}

function buildProgrammaticBlogPostingJsonLd(post: ProgrammaticPost) {
  const pageUrl = `${SITE}/blog/${post.slug}`;
  const heroAbsolute = `${SITE}${PROGRAMMATIC_HERO_SRC}`;
  const dateModified = post.dateModified ?? post.publishedAt;
  const locationKw = post.location ? `${post.location} cleaning Cape Town` : "Cape Town cleaning";
  const serviceKw = `${post.service} cleaning Cape Town`;
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

  const editorial = getBlogPost(slug);
  if (editorial) {
    const Body = POST_BODIES[editorial.slug as BlogPostSlug];
    if (!Body) notFound();

    const jsonLdStr = JSON.stringify(buildBlogPostGraphJsonLd(editorial)).replace(/</g, "\\u003c");

    return (
      <MarketingLayout>
        <main className="bg-white text-zinc-900">
          <GrowthTracking event="page_view" payload={{ page_type: "blog_post", slug: editorial.slug }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

          <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:max-w-4xl lg:px-8 lg:py-16">
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
              <span className="text-zinc-700">{editorial.title}</span>
            </nav>

            <header className="mt-6 border-b border-zinc-200 pb-10">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
              <h1 className="mt-3 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.35rem] lg:leading-tight">
                {editorial.title}
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-zinc-600">{editorial.description}</p>
              <p className="mt-4 text-sm text-zinc-500">
                Published{" "}
                {new Intl.DateTimeFormat("en-ZA", {
                  dateStyle: "long",
                  timeZone: "Africa/Johannesburg",
                }).format(new Date(editorial.publishedAt))}{" "}
                · {editorial.readingTimeMinutes} min read
              </p>
            </header>

            <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 shadow-md ring-1 ring-zinc-200/60">
              <Image
                src={editorial.heroImage.src}
                alt={editorial.heroImage.alt}
                fill
                className="object-cover"
                sizes="(max-width: 896px) 100vw, 896px"
                priority
                fetchPriority="high"
              />
            </div>

            <div className="py-10">
              <BlogPostGlobalSections post={editorial} />
              <Body />
              <BlogContextualServiceLinks />
              <BlogServiceLinks service={getBlogServiceType(editorial.slug)} />
              <BlogRelatedGuidesSection post={editorial} />
              <div className="mt-12">
                <RelatedLinks placement="blog" />
              </div>
              <BlogArticleEndCta trackingSlug={editorial.slug} />
            </div>

            <footer className="not-prose mt-8 border-t border-zinc-200 pt-8 text-center">
              <p className="text-sm text-zinc-500">
                <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
                  ← Back to all articles
                </Link>
              </p>
            </footer>
          </article>
        </main>
      </MarketingLayout>
    );
  }

  const hc = getHighConversionBlogPost(slug);
  if (hc) {
    const jsonLdStr = JSON.stringify(buildHighConversionGraphJsonLd(hc)).replace(/</g, "\\u003c");
    const readMin = hc.readingTimeMinutes ?? 6;

    return (
      <MarketingLayout>
        <main className="bg-white text-zinc-900">
          <GrowthTracking event="page_view" payload={{ page_type: "blog_high_conversion", slug: hc.slug }} />
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

          <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:max-w-4xl lg:px-8 lg:py-16">
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
              <span className="text-zinc-700">{hc.title}</span>
            </nav>

            <header className="mt-6 border-b border-zinc-200 pb-10">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
              <p className="mt-4 text-lg leading-relaxed text-zinc-600">{hc.description}</p>
              <p className="mt-4 text-sm text-zinc-500">
                Published{" "}
                {new Intl.DateTimeFormat("en-ZA", {
                  dateStyle: "long",
                  timeZone: "Africa/Johannesburg",
                }).format(new Date(hc.publishedAt))}{" "}
                · {readMin} min read
              </p>
            </header>

            <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 shadow-md ring-1 ring-zinc-200/60">
              <Image
                src={hc.heroImage.src}
                alt={hc.heroImage.alt}
                fill
                className="object-cover"
                sizes="(max-width: 896px) 100vw, 896px"
                priority
                fetchPriority="high"
              />
            </div>

            <div className="py-10">
              <HighConversionBlogTemplate article={hc} />
              <BlogContextualServiceLinks />
              <BlogServiceLinks service={getBlogServiceType(hc.slug)} />
              <div className="mt-12">
                <RelatedLinks placement="blog" />
              </div>
              <BlogArticleEndCta trackingSlug={hc.slug} />
            </div>

            <footer className="not-prose mt-8 border-t border-zinc-200 pt-8 text-center">
              <p className="text-sm text-zinc-500">
                <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
                  ← Back to all articles
                </Link>
              </p>
            </footer>
          </article>
        </main>
      </MarketingLayout>
    );
  }

  const prog = getProgrammaticPost(slug);
  if (!prog) notFound();

  const jsonLdStr = JSON.stringify(buildProgrammaticGraphJsonLd(prog)).replace(/</g, "\\u003c");

  return (
    <MarketingLayout>
      <main className="bg-white text-zinc-900">
        <GrowthTracking event="page_view" payload={{ page_type: "blog_programmatic", slug: prog.slug }} />
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:max-w-4xl lg:px-8 lg:py-16">
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
            <span className="text-zinc-700">{prog.h1}</span>
          </nav>

          <header className="mt-6 border-b border-zinc-200 pb-10">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
            <p className="mt-4 text-lg leading-relaxed text-zinc-600">{prog.description}</p>
            <p className="mt-4 text-sm text-zinc-500">
              Published{" "}
              {new Intl.DateTimeFormat("en-ZA", {
                dateStyle: "long",
                timeZone: "Africa/Johannesburg",
              }).format(new Date(prog.publishedAt))}{" "}
              · 5 min read
            </p>
          </header>

          <div className="relative mt-8 aspect-[16/9] w-full overflow-hidden rounded-2xl bg-zinc-100 shadow-md ring-1 ring-zinc-200/60">
            <Image
              src={PROGRAMMATIC_HERO_SRC}
              alt={`${prog.h1} — Shalean professional cleaning in Cape Town`}
              fill
              className="object-cover"
              sizes="(max-width: 896px) 100vw, 896px"
              priority
              fetchPriority="high"
            />
          </div>

          <div className="py-10">
            <ProgrammaticBlogTemplate post={prog} />
            <BlogContextualServiceLinks />
            <BlogServiceLinks service={getBlogServiceType(prog.slug)} />
            <div className="mt-12">
              <RelatedLinks placement="blog" />
            </div>
            <BlogArticleEndCta trackingSlug={prog.slug} />
          </div>

          <footer className="not-prose mt-8 border-t border-zinc-200 pt-8 text-center">
            <p className="text-sm text-zinc-500">
              <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
                ← Back to all articles
              </Link>
            </p>
          </footer>
        </article>
      </main>
    </MarketingLayout>
  );
}
