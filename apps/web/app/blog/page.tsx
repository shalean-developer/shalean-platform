import type { Metadata } from "next";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { marketingWhatsAppFloatMainPadding } from "@/lib/marketing/marketingMobileLayout";
import { BlogFeaturedHeroCard } from "@/components/blog/BlogFeaturedHeroCard";
import { BlogGridWithQuoteCta } from "@/components/blog/BlogGridWithQuoteCta";
import { BlogTopicFilterNav } from "@/components/blog/BlogTopicFilterNav";
import { BlogCard } from "@/components/blog/BlogCard";
import {
  BLOG_INDEX_LOCATION_HUBS,
  BLOG_START_HERE_CARDS,
  blogTopicMetaLabel,
  enrichBlogPostsForIndexCards,
  filterPostsByTopic,
  parseBlogTopicParam,
  resolveFeaturedPost,
  resolvePopularPosts,
  sortBlogIndexPostsCommercialFirst,
  type BlogTopicFilterId,
} from "@/lib/blog/blog-index-hub";
import { getAllPublishedPosts } from "@/lib/blog/get-all-posts";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { BLOG_SERP_TITLE_MAX, generateCtrTitle } from "@/lib/seo/metaTitle";
import { absoluteCanonicalUrl, SITE_ORIGIN as SITE } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW, SEO_NOINDEX_FOLLOW } from "@/lib/site/seoRobots";
import { CAPE_TOWN_PRICING_AUTHORITY_HREF } from "@/lib/seo/internalLinks";

const CANONICAL_ABS = absoluteCanonicalUrl("/blog");
const PAGE_URL = CANONICAL_ABS;

const H1 = "Cleaning Guides & Prices in Cape Town";
const DEFAULT_DESCRIPTION = clampMetaDescription(
  "Practical cleaning guides for Cape Town homes and hosts—cleaning prices Cape Town, deep cleaning vs standard, Airbnb turnovers, move-out checklists, and booking cleaners near me with an instant quote when you are ready.",
);

const ogImage = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

type BlogPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ searchParams }: BlogPageProps): Promise<Metadata> {
  const sp = await searchParams;
  const topic = parseBlogTopicParam(sp.topic);
  const title =
    topic === "all"
      ? generateCtrTitle({
          base: "Cleaning Guides",
          place: "Cape Town",
          templateKey: "blog-index|all",
          brandSuffix: "Shalean",
          pageIntent: "hub",
          maxLen: BLOG_SERP_TITLE_MAX,
        })
      : generateCtrTitle({
          base: `${blogTopicMetaLabel(topic)} Tips`,
          place: "Cape Town",
          templateKey: `blog-index|topic|${topic}`,
          brandSuffix: "Shalean",
          pageIntent: "hub",
          maxLen: BLOG_SERP_TITLE_MAX,
        });

  const description =
    topic === "all"
      ? DEFAULT_DESCRIPTION
      : clampMetaDescription(
          `${blogTopicMetaLabel(topic)}—Shalean Cape Town cleaning articles with clear scope tips and online booking.`,
        );

  return {
    title,
    description,
    robots: topic === "all" ? SEO_INDEX_FOLLOW : SEO_NOINDEX_FOLLOW,
    alternates: { canonical: CANONICAL_ABS },
    openGraph: {
      type: "website",
      url: PAGE_URL,
      title,
      description,
      images: [{ url: `${SITE}${ogImage}`, alt: "Cleaning guides and Cape Town home cleaning — Shalean" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [`${SITE}${ogImage}`],
    },
  };
}

export default async function BlogIndexPage({ searchParams }: BlogPageProps) {
  const sp = await searchParams;
  const activeTopic: BlogTopicFilterId | "all" = parseBlogTopicParam(sp.topic);

  const dbPosts = await getAllPublishedPosts();
  const enriched = enrichBlogPostsForIndexCards(dbPosts);

  const featured = resolveFeaturedPost(enriched);
  const featuredSlug = featured?.slug ?? null;

  const popular = resolvePopularPosts(enriched, {
    excludeSlugs: featuredSlug ? new Set([featuredSlug]) : new Set(),
  });
  const popularSlugs = new Set(popular.map((p) => p.slug));

  let gridSource =
    activeTopic === "all"
      ? enriched.filter((p) => p.slug !== featuredSlug && !popularSlugs.has(p.slug))
      : enriched;

  if (activeTopic === "all" && gridSource.length === 0 && enriched.length > 0 && featuredSlug) {
    gridSource = enriched.filter((p) => p.slug !== featuredSlug);
  }

  let visible = filterPostsByTopic(gridSource, activeTopic);
  const rawQ = sp.q;
  const searchQuery = typeof rawQ === "string" ? rawQ.trim().toLowerCase() : "";

  if (searchQuery) {
    visible = visible.filter(
      (p) =>
        p.title.toLowerCase().includes(searchQuery) ||
        p.displayExcerpt.toLowerCase().includes(searchQuery) ||
        p.slug.toLowerCase().includes(searchQuery),
    );
  } else if (activeTopic === "all" && visible.length > 1) {
    visible = sortBlogIndexPostsCommercialFirst(visible);
  }

  const jsonLdPosts: typeof enriched = [];
  const jsonLdSeen = new Set<string>();

  for (const post of enriched) {
    if (jsonLdSeen.has(post.slug)) continue;
    jsonLdSeen.add(post.slug);
    jsonLdPosts.push(post);
    if (jsonLdPosts.length >= 20) break;
  }

  const blogIndexJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${PAGE_URL}#blog`,
    name: H1,
    description: DEFAULT_DESCRIPTION,
    url: PAGE_URL,
    publisher: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
      url: SITE,
    },
    blogPost: jsonLdPosts.map((post) => ({
      "@type": ["BlogPosting", "Article"],
      headline: post.title,
      description: clampMetaDescription(post.displayExcerpt),
      url: `${SITE}/blog/${post.slug}`,
      datePublished: post.publishedAt,
      image: post.image.src.startsWith("http") ? post.image.src : `${SITE}${post.image.src}`,
      author: { "@type": "Organization", name: "Shalean Cleaning Services" },
      publisher: {
        "@type": "Organization",
        name: "Shalean Cleaning Services",
        url: SITE,
      },
    })),
  };

  const jsonLdStr = JSON.stringify(blogIndexJsonLd).replace(/</g, "\\u003c");

  return (
    <MarketingLayout>
      <main className={`mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-16 ${marketingWhatsAppFloatMainPadding}`}>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

        <header className="mx-auto max-w-3xl text-center lg:max-w-4xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-600">Shalean · Cape Town</p>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.75rem] lg:leading-[1.12]">
            {H1}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg">
            {DEFAULT_DESCRIPTION}
          </p>
        </header>

        {featured ? (
          <div className="mt-12 lg:mt-14">
            <BlogFeaturedHeroCard post={featured} />
          </div>
        ) : null}

        <section className="mt-16 lg:mt-20" aria-labelledby="start-here-heading">
          <div className="mx-auto max-w-2xl text-center">
            <h2 id="start-here-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
              Start here
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-zinc-600 sm:text-base">
              Choose what brought you here—we route pricing, move-outs, Airbnb, or straight to booking.
            </p>
          </div>

          <ul className="mx-auto mt-10 grid max-w-6xl gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {BLOG_START_HERE_CARDS.map((card) => (
              <li key={card.title}>
                <article className="flex h-full flex-col rounded-2xl border border-zinc-200/90 bg-zinc-50/40 p-6 shadow-sm ring-1 ring-zinc-950/[0.03] transition hover:border-blue-200/80 hover:bg-white hover:shadow-md">
                  <h3 className="text-lg font-semibold text-zinc-900">{card.title}</h3>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-zinc-600">{card.body}</p>
                  <SafeInternalLink
                    href={card.href}
                    className="mt-5 inline-flex text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
                  >
                    {card.cta} →
                  </SafeInternalLink>
                </article>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-16 lg:mt-24" aria-labelledby="popular-heading">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="popular-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
                Most popular
              </h2>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
                The guides readers open most—pricing, comparisons, move-outs, and hosting.
              </p>
            </div>
          </div>

          {popular.length > 0 ? (
            <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-8 lg:grid-cols-4 lg:gap-6">
              {popular.map((post, i) => (
                <BlogCard key={post.slug} post={post} priority={i < 2} />
              ))}
            </div>
          ) : null}
        </section>

        <section className="mt-16 lg:mt-24" aria-labelledby="articles-heading">
          <div className="flex flex-col gap-4 border-t border-zinc-200/80 pt-14 lg:pt-16">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 id="articles-heading" className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl">
                  All articles
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
                  Filter by topic. Every article is written to help you book with clear scope—deep cleaning, move-outs,
                  Airbnb, pricing, and online booking.
                </p>
              </div>

              {activeTopic !== "all" || searchQuery ? (
                <p className="text-sm font-medium text-blue-800 lg:text-right" role="status">
                  {activeTopic !== "all" ? (
                    <>
                      {blogTopicMetaLabel(activeTopic)}
                      <br />
                    </>
                  ) : null}
                  {searchQuery ? (
                    <>
                      Search: “{searchQuery}”
                      <br />
                    </>
                  ) : null}
                  <SafeInternalLink href="/blog" className="font-normal text-blue-700 underline-offset-2 hover:underline">
                    Clear filter
                  </SafeInternalLink>
                </p>
              ) : null}
            </div>

            <BlogTopicFilterNav active={activeTopic} />
          </div>

          {dbPosts.length === 0 ? (
            <p className="mt-12 text-center text-zinc-600">No published guides yet. Check back soon.</p>
          ) : visible.length === 0 ? (
            <p className="mt-12 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/80 px-6 py-12 text-center text-zinc-600">
              No articles match this filter yet.{" "}
              <SafeInternalLink href="/blog" className="font-semibold text-blue-700 underline-offset-2 hover:underline">
                View all articles
              </SafeInternalLink>
              .
            </p>
          ) : (
            <div className="mt-10">
              <BlogGridWithQuoteCta posts={visible} eagerFirstRow={3} />
            </div>
          )}
        </section>

        <section
          className="mt-16 rounded-2xl border border-zinc-200/90 bg-white px-6 py-10 shadow-sm ring-1 ring-zinc-950/[0.03] lg:mt-20"
          aria-labelledby="blog-locations-heading"
        >
          <h2 id="blog-locations-heading" className="text-xl font-bold text-zinc-900">
            Cleaning services by area
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-zinc-600">
            Browse suburb hubs—cleaners near me across Claremont, the Atlantic Seaboard, Southern Suburbs, and
            Durbanville—then pair local coverage with the guides above. For citywide scope and booking, start from the{" "}
            <SafeInternalLink
              href="/cleaning-services-cape-town"
              className="font-semibold text-blue-800 underline-offset-2 hover:underline"
            >
              Cape Town cleaning services hub
            </SafeInternalLink>
            .
          </p>

          <ul className="mt-8 flex flex-wrap gap-2">
            {BLOG_INDEX_LOCATION_HUBS.map((hub) => (
              <li key={hub.slug}>
                <SafeInternalLink
                  href={`/locations/${hub.slug}`}
                  className="inline-flex rounded-full border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-800 transition hover:border-blue-200 hover:bg-blue-50 hover:text-blue-900"
                >
                  {hub.name}
                </SafeInternalLink>
              </li>
            ))}
          </ul>
        </section>

        <section
          className="mt-16 overflow-hidden rounded-3xl bg-zinc-900 px-6 py-14 text-center shadow-xl sm:px-10 lg:mt-20 lg:py-16"
          aria-labelledby="blog-final-cta-heading"
        >
          <h2
            id="blog-final-cta-heading"
            className="text-2xl font-bold tracking-tight text-white sm:text-3xl lg:text-[2rem] lg:leading-tight"
          >
            Ready for a cleaner home?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-relaxed text-zinc-300">
            Book vetted Cape Town teams online—see your total first, then choose a slot that fits. Same transparent flow
            whether you need standard upkeep, deep cleaning, move-out, or Airbnb turnover.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <SafeInternalLink
              href="/book"
              className="inline-flex min-h-[48px] min-w-[200px] items-center justify-center rounded-full bg-white px-8 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Get instant quote
            </SafeInternalLink>

            <SafeInternalLink
              href={CAPE_TOWN_PRICING_AUTHORITY_HREF}
              className="inline-flex min-h-[48px] items-center justify-center rounded-full border border-zinc-600 px-6 py-3 text-sm font-semibold text-white transition hover:border-zinc-400 hover:bg-white/5"
            >
              See Cape Town prices
            </SafeInternalLink>
          </div>
        </section>
      </main>
    </MarketingLayout>
  );
}