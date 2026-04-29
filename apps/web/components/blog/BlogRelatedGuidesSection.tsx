import Link from "next/link";
import { relatedGuidesServiceTrio } from "@/lib/blog/blogServiceContextLinks";
import { resolveRelatedPosts } from "@/lib/blog/resolveRelatedPosts";
import type { BlogPostMeta, BlogPostSlug } from "@/lib/blog/posts";

export function BlogRelatedGuidesSection({ post }: { post: BlogPostMeta }) {
  const related = resolveRelatedPosts(post.slug as BlogPostSlug, post.relatedSlugs, 5);
  const trio = relatedGuidesServiceTrio(post.slug);

  return (
    <section
      className="not-prose mt-12 rounded-2xl border border-zinc-200 bg-zinc-50/80 px-6 py-8"
      aria-labelledby="related-guides-heading"
    >
      <h2 id="related-guides-heading" className="text-lg font-bold tracking-tight text-zinc-900">
        Related Cleaning Guides
      </h2>
      <p className="mt-2 text-sm text-zinc-600">More Cape Town cleaning guides and service pages worth bookmarking.</p>

      <ul className="mt-4 list-inside list-disc space-y-2 text-sm font-medium text-zinc-800">
        {related.map((r) => (
          <li key={r.slug}>
            <Link href={`/blog/${r.slug}`} className="text-blue-600 hover:text-blue-700 hover:underline">
              {r.title}
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-zinc-500">Popular services</p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
        {trio.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="text-blue-600 transition hover:text-blue-700 hover:underline">
              {item.anchor}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
