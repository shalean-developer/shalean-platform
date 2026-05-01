import type { Metadata } from "next";
import Link from "next/link";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { BlogGrid } from "@/components/blog/BlogGrid";
import {
  DEFAULT_LIST_HERO,
  getAllPublishedPosts,
  type BlogIndexPost,
} from "@/lib/blog/get-all-posts";
import { getAllHighConversionBlogPosts } from "@/lib/blog/highConversionPosts";
import { PROGRAMMATIC_POSTS } from "@/lib/blog/programmaticPosts";
import { getAllBlogPosts } from "@/lib/blog/posts";

const SITE = "https://www.shalean.co.za";
const CANONICAL = "/blog";
const PAGE_URL = `${SITE}${CANONICAL}`;

const title = "Cleaning Guides & Tips | Shalean";
const description =
  "Expert cleaning tips, pricing guides, and local cleaning advice in Cape Town.";

const ogImage = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: "website",
    url: PAGE_URL,
    title,
    description,
    images: [{ url: `${SITE}${ogImage}`, alt: "Cleaning guides and tips — Shalean Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [`${SITE}${ogImage}`],
  },
};

function mergeBlogIndexPosts(db: BlogIndexPost[]): BlogIndexPost[] {
  const map = new Map<string, BlogIndexPost>();

  for (const p of getAllBlogPosts()) {
    map.set(p.slug, {
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      image: p.heroImage,
      readingTime: p.readingTimeMinutes,
      publishedAt: p.publishedAt,
      source: "editorial",
    });
  }

  for (const p of getAllHighConversionBlogPosts()) {
    if (map.has(p.slug)) continue;
    const excerpt = p.description.length > 200 ? `${p.description.slice(0, 197)}…` : p.description;
    map.set(p.slug, {
      slug: p.slug,
      title: p.title,
      excerpt,
      image: p.heroImage,
      readingTime: p.readingTimeMinutes ?? 6,
      publishedAt: p.publishedAt,
      source: "high_conversion",
    });
  }

  for (const p of PROGRAMMATIC_POSTS) {
    if (map.has(p.slug)) continue;
    const excerpt = p.description.length > 200 ? `${p.description.slice(0, 197)}…` : p.description;
    map.set(p.slug, {
      slug: p.slug,
      title: p.title,
      excerpt,
      image: { src: DEFAULT_LIST_HERO, alt: `${p.h1} — Shalean Cape Town` },
      readingTime: 5,
      publishedAt: p.publishedAt,
      source: "programmatic",
    });
  }

  for (const p of db) {
    if (!map.has(p.slug)) map.set(p.slug, p);
  }

  return [...map.values()].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export default async function BlogIndexPage() {
  const dbPosts = await getAllPublishedPosts();
  const posts = mergeBlogIndexPosts(dbPosts);

  const useFeaturedSplit = posts.length > 3;
  const featured = useFeaturedSplit ? posts.slice(0, 3) : [];
  const more = useFeaturedSplit ? posts.slice(3) : posts;

  const quickLinks = posts.slice(0, 10);

  const blogIndexJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${PAGE_URL}#blog`,
    name: "Cleaning guides & tips",
    description,
    url: PAGE_URL,
    publisher: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
      url: SITE,
    },
    blogPost: posts.slice(0, 20).map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.excerpt,
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
      <main className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
          Blog &amp; cleaning guides
        </h1>
        <p className="mt-4 max-w-3xl text-lg leading-relaxed text-zinc-600">
          Expert cleaning tips, transparent pricing explainers, and suburb-level advice for Cape Town homes,
          Airbnb hosts, and move-outs—written so you can book with confidence when you are ready.
        </p>

        {posts.length === 0 ? (
          <p className="mt-12 text-center text-zinc-600">No published guides yet. Check back soon.</p>
        ) : null}

        {posts.length > 0 && quickLinks.length > 0 ? (
          <nav
            className="mt-8 flex flex-wrap gap-x-4 gap-y-2 border-b border-zinc-200 pb-8 text-sm text-zinc-600"
            aria-label="Popular guides"
          >
            <span className="font-semibold text-zinc-800">Jump to:</span>
            {quickLinks.map((p) => (
              <Link
                key={p.slug}
                href={`/blog/${p.slug}`}
                className="text-blue-700 underline-offset-2 hover:text-blue-800 hover:underline"
              >
                {p.title.length > 48 ? `${p.title.slice(0, 45)}…` : p.title}
              </Link>
            ))}
          </nav>
        ) : null}

        {posts.length > 0 && useFeaturedSplit ? (
          <>
            <section className="mt-12" aria-labelledby="blog-featured-heading">
              <h2
                id="blog-featured-heading"
                className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl"
              >
                Featured guides
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-zinc-600">
                Our most-read articles on booking, pricing, and getting consistent results across the city.
              </p>
              <div className="mt-8">
                <BlogGrid posts={featured} eagerImageCount={3} />
              </div>
            </section>
            <section className="mt-16 lg:mt-20" aria-labelledby="blog-all-heading">
              <h2 id="blog-all-heading" className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                All guides
              </h2>
              <div className="mt-8">
                <BlogGrid posts={more} />
              </div>
            </section>
          </>
        ) : posts.length > 0 ? (
          <div className="mt-12">
            <BlogGrid posts={posts} eagerImageCount={2} />
          </div>
        ) : null}

        <section
          className="mt-16 rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-6 py-8 lg:mt-20"
          aria-labelledby="blog-categories-heading"
        >
          <h2 id="blog-categories-heading" className="text-lg font-semibold text-zinc-900">
            Browse by category
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-zinc-600">
            Topic filters (deep cleaning, Airbnb, move-out, suburbs) are coming soon. Until then, use the guides
            above or start a booking for live pricing.
          </p>
        </section>
      </main>
    </MarketingLayout>
  );
}
