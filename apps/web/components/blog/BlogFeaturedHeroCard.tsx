import Image from "next/image";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import type { BlogIndexCardPost } from "@/lib/blog/blog-index-hub";

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

export function BlogFeaturedHeroCard({ post }: { post: BlogIndexCardPost }) {
  const remote = isRemoteSrc(post.image.src);
  const titleId = `blog-featured-title-${post.slug}`;

  return (
    <article
      className="overflow-hidden rounded-2xl border border-zinc-200/90 bg-white shadow-[0_2px_24px_-4px_rgba(15,23,42,0.08)] ring-1 ring-zinc-950/[0.04]"
      aria-labelledby={titleId}
    >
      <div className="grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-stretch">
        <SafeInternalLink
          href={`/blog/${post.slug}`}
          className="relative aspect-[16/9] w-full overflow-hidden bg-zinc-100 lg:aspect-auto lg:min-h-[280px] xl:min-h-[320px]"
          aria-label={post.title}
        >
          <Image
            src={post.image.src}
            alt={post.image.alt}
            fill
            className="object-cover transition duration-500 hover:scale-[1.02]"
            sizes="(max-width: 1024px) 100vw, 55vw"
            priority
            unoptimized={remote}
          />
        </SafeInternalLink>

        <div className="flex flex-col justify-center gap-4 px-6 py-8 sm:px-10 sm:py-10 lg:py-12">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
              Featured
            </span>
            <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
              {post.cardBadge}
            </span>
            <span className="text-xs font-medium text-zinc-500">
              {formatDate(post.publishedAt)} · {post.readingTime} min read
            </span>
          </div>

          <div>
            <h2 id={titleId} className="text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl sm:leading-tight">
              <SafeInternalLink
                href={`/blog/${post.slug}`}
                className="text-zinc-900 transition hover:text-blue-700 hover:underline hover:decoration-blue-600/30"
              >
                {post.title}
              </SafeInternalLink>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-zinc-600 sm:text-[1.05rem]">{post.displayExcerpt}</p>
          </div>

          <div className="flex flex-wrap gap-3 pt-1">
            <SafeInternalLink
              href={`/blog/${post.slug}`}
              className="inline-flex items-center justify-center rounded-full bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              Read full guide
            </SafeInternalLink>
            <SafeInternalLink
              href="/booking/details"
              className="inline-flex items-center justify-center rounded-full border border-zinc-200 bg-white px-6 py-2.5 text-sm font-semibold text-zinc-800 transition hover:border-zinc-300 hover:bg-zinc-50"
            >
              Get instant quote
            </SafeInternalLink>
          </div>
        </div>
      </div>
    </article>
  );
}
