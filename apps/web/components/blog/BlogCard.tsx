import Image from "next/image";
import Link from "next/link";
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

export function BlogCard({ post, priority }: { post: BlogIndexCardPost; priority?: boolean }) {
  const remote = isRemoteSrc(post.image.src);

  const titleId = `blog-card-title-${post.slug}`;

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)] ring-1 ring-zinc-950/[0.03] transition hover:border-zinc-300 hover:shadow-[0_8px_28px_-6px_rgba(15,23,42,0.12)]"
      aria-labelledby={titleId}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="relative aspect-[16/9] w-full shrink-0 overflow-hidden bg-zinc-100"
        aria-label={post.title}
      >
        <Image
          src={post.image.src}
          alt={post.image.alt}
          fill
          className="object-cover transition duration-300 group-hover:scale-[1.02]"
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          loading={priority ? "eager" : "lazy"}
          unoptimized={remote}
        />
      </Link>
      <div className="flex min-h-0 flex-1 flex-col p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-blue-800">
            {post.cardBadge}
          </span>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            {formatDate(post.publishedAt)} · {post.readingTime} min read
          </p>
        </div>
        <h3
          id={titleId}
          className="mt-2 text-lg font-semibold leading-snug tracking-tight text-zinc-900 sm:text-xl"
        >
          <Link
            href={`/blog/${post.slug}`}
            className="text-blue-700 transition hover:text-blue-800 hover:underline"
          >
            {post.title}
          </Link>
        </h3>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-600">{post.displayExcerpt}</p>
        <Link
          href={`/blog/${post.slug}`}
          className="mt-4 inline-flex text-sm font-semibold text-blue-600 transition hover:text-blue-700"
        >
          Read article →
        </Link>
      </div>
    </article>
  );
}
