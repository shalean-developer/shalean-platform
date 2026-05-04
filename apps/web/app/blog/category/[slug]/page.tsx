import type { Metadata } from "next";
import Link from "next/link";
import MarketingLayout from "@/components/marketing-home/MarketingLayout";
import { getBlogPostsByCategorySlug } from "@/lib/blog/get-taxonomy-posts";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";
import { cn } from "@/lib/utils";

const SITE = "https://www.shalean.co.za";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const title = `${slug.replace(/-/g, " ")} | Blog categories | Shalean`;
  const canonical = `/blog/category/${slug}`;
  return {
    title,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      url: `${SITE}${canonical}`,
      type: "website",
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
          <Link href="/" className={cn(linkInNavClassName, "text-sm")}>
            Home
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <Link href="/blog" className={cn(linkInNavClassName, "text-sm")}>
            Blog
          </Link>
          <span className="mx-2 text-zinc-400">/</span>
          <span className="text-zinc-700">Category</span>
        </nav>

        <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900 capitalize">{slug.replace(/-/g, " ")}</h1>
        <p className="mt-2 text-zinc-600">Articles in this category.</p>

        <ul className="mt-10 space-y-6">
          {posts.length === 0 ? (
            <li className="text-sm text-zinc-500">No published posts in this category yet.</li>
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
