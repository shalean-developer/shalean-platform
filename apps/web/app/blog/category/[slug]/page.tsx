import type { Metadata } from "next";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { getBlogPostsByCategorySlug } from "@/lib/blog/get-taxonomy-posts";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { BLOG_SERP_TITLE_MAX, generateCtrTitle } from "@/lib/seo/metaTitle";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_NOINDEX_FOLLOW } from "@/lib/site/seoRobots";

type Props = { params: Promise<{ slug: string }> };

const OG_IMAGE = "/images/marketing/cape-town-house-cleaning-kitchen.webp";

function titleCaseFromSlug(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const label = titleCaseFromSlug(slug);

  const title = generateCtrTitle({
    base: `${label} Articles`,
    place: "Cape Town",
    templateKey: `blog-cat|${slug}`,
    brandSuffix: "Shalean Blog",
    pageIntent: "hub",
    maxLen: BLOG_SERP_TITLE_MAX,
  });

  const canonicalAbs = absoluteCanonicalUrl(`/blog/category/${slug}`);

  const description = clampMetaDescription(
    `${label} articles—Cape Town cleaning guides, pricing context, and booking tips from Shalean.`,
  );

  return {
    title,
    description,
    alternates: { canonical: canonicalAbs },
    robots: SEO_NOINDEX_FOLLOW,
    openGraph: {
      title,
      description,
      url: canonicalAbs,
      type: "website",
      images: [
        {
          url: OG_IMAGE,
          width: 1200,
          height: 630,
          alt: "Shalean Cleaning Services in Cape Town",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [OG_IMAGE],
    },
  };
}

export default async function BlogCategoryPage({ params }: Props) {
  const { slug } = await params;
  const posts = await getBlogPostsByCategorySlug(slug);

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
          <SafeInternalLink href="/" className={cn(linkInNavClassName, "text-sm")}>
            Home
          </SafeInternalLink>

          <span className="mx-2 text-zinc-400">/</span>

          <SafeInternalLink href="/blog" className={cn(linkInNavClassName, "text-sm")}>
            Blog
          </SafeInternalLink>

          <span className="mx-2 text-zinc-400">/</span>

          <span className="text-zinc-700">Category</span>
        </nav>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900 capitalize">
          {slug.replace(/-/g, " ")}
        </h1>

        <p className="mt-2 text-zinc-600">Articles in this category.</p>

        <ul className="mt-10 space-y-6">
          {posts.length === 0 ? (
            <li className="text-sm text-zinc-500">
              No published posts in this category yet.
            </li>
          ) : (
            posts.map((p) => (
              <li
                key={p.slug}
                className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm"
              >
                <SafeInternalLink
                  href={`/blog/${p.slug}`}
                  className="text-lg font-semibold text-blue-700 hover:underline"
                >
                  {p.title}
                </SafeInternalLink>

                <p className="mt-2 text-sm text-zinc-600">{p.excerpt}</p>
              </li>
            ))
          )}
        </ul>
      </main>
    </MarketingLayout>
  );
}