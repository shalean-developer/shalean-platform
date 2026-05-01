import Image from "next/image";
import Link from "next/link";
import type { BlogIndexPost } from "@/lib/blog/get-all-posts";

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(iso));
}

export function BlogCard({ post, priority }: { post: BlogIndexPost; priority?: boolean }) {
  const remote = isRemoteSrc(post.image.src);

  const titleId = `blog-card-title-${post.slug}`;

  return (
    <article
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-200/80 bg-white shadow-sm ring-zinc-950/5 transition hover:border-zinc-300 hover:shadow-md"
      aria-labelledby={titleId}
    >
      <Link
        href={`/blog/${post.slug}`}
        className="relative aspect-[16/10] w-full shrink-0 overflow-hidden bg-zinc-100"
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
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {formatDate(post.publishedAt)} · {post.readingTime} min read
        </p>
        <h2
          id={titleId}
          className="mt-2 text-lg font-semibold leading-snug tracking-tight text-zinc-900 sm:text-xl"
        >
          <Link
            href={`/blog/${post.slug}`}
            className="text-blue-700 transition hover:text-blue-800 hover:underline"
          >
            {post.title}
          </Link>
        </h2>
        <p className="mt-3 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-600">{post.excerpt}</p>
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
