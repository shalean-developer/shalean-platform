import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { getAllBlogPosts } from "@/lib/blog/posts";

const SITE = "https://www.shalean.co.za";
const CANONICAL = "/blog";
const PAGE_URL = `${SITE}${CANONICAL}`;

const title = "Cleaning Tips & Guides in Cape Town | Shalean Blog";
const description =
  "Cleaning tips and guides for Cape Town homes, Airbnb turnovers, move-outs, and pricing—each article links to our service pages when you are ready to book.";

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
    images: [{ url: ogImage, alt: "Cleaning tips and guides for Cape Town" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [ogImage],
  },
};

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts();
  const blogIndexJsonLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    "@id": `${PAGE_URL}#blog`,
    name: "Cleaning Tips & Guides in Cape Town",
    description,
    url: PAGE_URL,
    publisher: {
      "@type": "Organization",
      name: "Shalean Cleaning Services",
      url: SITE,
    },
    blogPost: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      description: post.description,
      url: `${SITE}/blog/${post.slug}`,
      datePublished: post.publishedAt,
      dateModified: post.dateModified ?? post.publishedAt,
      image: `${SITE}${post.heroImage.src}`,
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
      <main className="mx-auto max-w-3xl px-4 py-14 sm:px-6 lg:px-8">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdStr }} />

        <p className="text-sm font-semibold uppercase tracking-wide text-blue-600">Shalean · Cape Town</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-zinc-900 sm:text-4xl">
          Cleaning Tips &amp; Guides in Cape Town
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-zinc-600">
          Practical articles on Airbnb turnovers, move-out handovers, and how pricing works across Cape Town—each links
          to our service pages when you are ready to book.
        </p>

        <ul className="mt-12 space-y-8">
          {posts.map((post, index) => (
            <li key={post.slug} className="border-b border-zinc-200 pb-8 last:border-0">
              <article className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <Link
                  href={`/blog/${post.slug}`}
                  className="relative aspect-[16/10] w-full shrink-0 overflow-hidden rounded-xl bg-zinc-100 shadow-sm sm:aspect-video sm:w-44 md:w-52"
                >
                  <Image
                    src={post.heroImage.src}
                    alt={post.heroImage.alt}
                    fill
                    className="object-cover transition hover:opacity-95"
                    sizes="(max-width: 640px) 100vw, 208px"
                    loading={index === 0 ? "eager" : "lazy"}
                  />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
                    {formatDate(post.publishedAt)} · {post.readingTimeMinutes} min read
                  </p>
                  <h2 className="mt-2 text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
                    <Link
                      href={`/blog/${post.slug}`}
                      className="text-blue-700 transition hover:text-blue-800 hover:underline"
                    >
                      {post.title}
                    </Link>
                  </h2>
                  <p className="mt-2 text-zinc-600">{post.excerpt}</p>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="mt-3 inline-flex text-sm font-semibold text-blue-600 transition hover:text-blue-700"
                  >
                    Read article →
                  </Link>
                </div>
              </article>
            </li>
          ))}
        </ul>
      </main>
    </MarketingLayout>
  );
}
