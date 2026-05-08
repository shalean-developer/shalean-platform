import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { ArrowUpRight } from "lucide-react";
import { getPublishedHubBlogCards } from "@/lib/blog/get-all-posts";

export async function BlogLinks() {
  const featured = await getPublishedHubBlogCards();

  if (featured.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby="blog-heading">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="blog-heading" className="text-balance text-2xl font-semibold tracking-tight text-zinc-900 md:text-3xl dark:text-zinc-50">
            Cape Town cleaning guides
          </h2>
          <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
            Deep dives on pricing, move-outs, Airbnb turnovers, and choosing a service—then book from this hub or any suburb page.
          </p>
        </div>
        <SafeInternalLink href="/blog" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          View all articles
        </SafeInternalLink>
      </div>
      <ul className="mt-8 grid gap-4 md:grid-cols-2">
        {featured.map((post) => (
          <li key={post.slug}>
            <SafeInternalLink
              href={`/blog/${post.slug}`}
              className="group flex h-full flex-col rounded-2xl border border-zinc-200/90 bg-white p-5 shadow-sm transition hover:border-blue-200 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:border-blue-900"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-base font-semibold text-zinc-900 group-hover:text-blue-700 dark:text-zinc-50 dark:group-hover:text-blue-300">
                  {post.title}
                </h3>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-blue-600 dark:text-zinc-400" aria-hidden />
              </div>
              <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{post.excerpt}</p>
              <span className="mt-4 text-sm font-medium text-blue-600 dark:text-blue-400">Read guide</span>
            </SafeInternalLink>
          </li>
        ))}
      </ul>
    </section>
  );
}
