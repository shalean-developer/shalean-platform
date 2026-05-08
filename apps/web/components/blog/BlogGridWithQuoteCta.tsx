import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import type { BlogIndexCardPost } from "@/lib/blog/blog-index-hub";
import { BlogCard } from "@/components/blog/BlogCard";

const GRID =
  "grid grid-cols-1 gap-8 sm:grid-cols-2 sm:gap-10 lg:grid-cols-3 lg:gap-8";

type Props = {
  posts: BlogIndexCardPost[];
  /** Eager-load images for first row only */
  eagerFirstRow?: number;
};

export function BlogGridWithQuoteCta({ posts, eagerFirstRow = 3 }: Props) {
  if (posts.length === 0) return null;

  const firstRowCount = Math.min(3, posts.length);
  const first = posts.slice(0, firstRowCount);
  const rest = posts.slice(firstRowCount);

  return (
    <>
      <div className={GRID}>
        {first.map((post, i) => (
          <BlogCard key={post.slug} post={post} priority={i < eagerFirstRow} />
        ))}
      </div>

      <aside
        className="mt-10 flex flex-col gap-4 rounded-2xl border border-blue-100/90 bg-gradient-to-br from-blue-50 via-white to-zinc-50/40 px-6 py-8 shadow-[0_2px_20px_-4px_rgba(37,99,235,0.12)] sm:flex-row sm:items-center sm:justify-between sm:gap-8"
        aria-labelledby="blog-inline-cta-heading"
      >
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Instant pricing</p>
          <h2 id="blog-inline-cta-heading" className="mt-1 text-xl font-bold tracking-tight text-zinc-900">
            Get instant quote
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
            Lock bedrooms, bathrooms, and add-ons online—see your total before you pay, with cleaners matched across Cape Town.
          </p>
        </div>
        <SafeInternalLink
          href="/booking"
          className="inline-flex shrink-0 items-center justify-center rounded-full bg-blue-600 px-7 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/25 transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Get instant quote
        </SafeInternalLink>
      </aside>

      {rest.length > 0 ? (
        <div className={`mt-10 ${GRID}`}>
          {rest.map((post) => (
            <BlogCard key={post.slug} post={post} />
          ))}
        </div>
      ) : null}
    </>
  );
}
