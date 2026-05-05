import type { Metadata } from "next";
import Link from "next/link";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { getBlogPostsByTagSlug } from "@/lib/blog/get-taxonomy-posts";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";
import { clampMetaDescription } from "@/lib/seo/metaDescription";
import { BLOG_SERP_TITLE_MAX, generateCtrTitle } from "@/lib/seo/metaTitle";
import { absoluteCanonicalUrl } from "@/lib/site/canonical";
import { SEO_INDEX_FOLLOW } from "@/lib/site/seoRobots";

type Props = { params: Promise<{ slug: string }> };

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
    base: `${label} Posts`,
    place: "Cape Town",
    templateKey: `blog-tag|${slug}`,
    brandSuffix: "Shalean Blog",
    pageIntent: "hub",
    maxLen: BLOG_SERP_TITLE_MAX,
  });
  const canonicalAbs = absoluteCanonicalUrl(`/blog/tag/${slug}`);
  const description = clampMetaDescription(
    `Posts tagged “${label}”—practical Cape Town cleaning tips, scopes, and instant-quote booking from Shalean.`,
  );
  return {
    title,
    description,
    alternates: { canonical: canonicalAbs },
    robots: SEO_INDEX_FOLLOW,
    openGraph: {
      title,
      description,
      url: canonicalAbs,
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export default async function BlogTagPage({ params }: Props) {
  const { slug } = await params;
  const posts = await getBlogPostsByTagSlug(slug);

  return (
    <MarketingLayout>
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <nav className="text-sm text-zinc-500" aria-label="Breadcrumb">
          <Link href="/" className={cn(linkInNavClassName, "text-sm")}>
            Home
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
            Blog
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <span className="text-zinc-700">Tag</span>
        </nav>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900 capitalize">#{slug.replace(/-/g, " ")}</h1>
        <p className="mt-2 text-zinc-600">Posts tagged with this topic.</p>

        <ul className="mt-10 space-y-6">
          {posts.length === 0 ? (
            <li className="text-sm text-zinc-500">No posts with this tag yet.</li>
          ) : (
            posts.map((p) => (
              <li key={p.slug} className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
                <Link href={`/blog/${p.slug}`} className="text-lg font-semibold text-blue-700 hover:underline">
                  {p.title}
                </Link>
                <p className="mt-2 text-sm text-zinc-600">{p.excerpt}</p>
              </li>
            ))
          )}
        </ul>
      </main>
    </MarketingLayout>
  );
}
