import Image from "next/image";
import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import type { RelatedGridPost } from "@/lib/blog/get-blog-sidebar-data";
import { cn } from "@/lib/utils";

function isRemoteSrc(src: string) {
  return src.startsWith("http://") || src.startsWith("https://");
}

type Props = {
  posts: RelatedGridPost[];
  className?: string;
};

export function BlogRelatedPostsGrid({ posts, className }: Props) {
  if (posts.length === 0) return null;

  return (
    <section className={cn("not-prose", className)} aria-labelledby="blog-related-grid-heading">
      <h2 id="blog-related-grid-heading" className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
        Related articles
      </h2>
      <p className="mt-2 text-sm text-zinc-600">Keep reading—more Cape Town cleaning guides from Shalean.</p>

      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => {
          const remote = isRemoteSrc(post.image.src);
          return (
            <article
              key={post.slug}
              className="group flex flex-col overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-sm ring-1 ring-zinc-950/[0.03] transition hover:border-blue-200/90 hover:shadow-md"
            >
              <SafeInternalLink
                href={`/blog/${post.slug}`}
                className="relative aspect-[16/10] overflow-hidden bg-zinc-100"
                linkContext="blog related grid"
              >
                <Image
                  src={post.image.src}
                  alt={post.image.alt}
                  fill
                  className="object-cover transition duration-300 group-hover:scale-[1.02]"
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 320px"
                  loading="lazy"
                  unoptimized={remote}
                />
              </SafeInternalLink>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="text-base font-semibold leading-snug text-zinc-900">
                  <SafeInternalLink
                    href={`/blog/${post.slug}`}
                    className="transition hover:text-blue-800 hover:underline hover:decoration-blue-600/40 hover:underline-offset-4"
                    linkContext="blog related grid title"
                  >
                    {post.title}
                  </SafeInternalLink>
                </h3>
                {post.excerpt ? (
                  <p className="mt-2 line-clamp-2 flex-1 text-sm leading-relaxed text-zinc-600">{post.excerpt}</p>
                ) : null}
                <SafeInternalLink
                  href={`/blog/${post.slug}`}
                  className="mt-4 inline-flex text-sm font-semibold text-blue-700 underline-offset-4 hover:underline"
                  linkContext="blog related grid read more"
                >
                  Read more →
                </SafeInternalLink>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
