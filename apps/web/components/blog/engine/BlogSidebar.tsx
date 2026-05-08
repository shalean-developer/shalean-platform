import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { BLOG_START_HERE_CARDS } from "@/lib/blog/blog-index-hub";
import type { BlogIndexPost } from "@/lib/blog/get-all-posts";
import type { BlogSidebarCategory } from "@/lib/blog/get-blog-sidebar-data";
import { BlogSidebarSearch } from "@/components/blog/engine/BlogSidebarSearch";
import { cn } from "@/lib/utils";

type Props = {
  categories: BlogSidebarCategory[];
  trending: BlogIndexPost[];
  trackingSlug: string;
  className?: string;
};

function SidebarSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl border border-zinc-200/90 bg-white p-5 shadow-sm", className)}>
      <h2 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function BlogSidebar({ categories, trending, trackingSlug, className }: Props) {
  return (
    <aside className={cn("space-y-6", className)}>
      <BlogSidebarSearch />

      {categories.length > 0 ? (
        <SidebarSection title="Categories">
          <nav aria-label="Blog categories">
            <ul className="space-y-2">
              <li>
                <SafeInternalLink
                  href="/blog"
                  className="text-sm font-medium text-zinc-700 underline-offset-4 hover:text-blue-800 hover:underline"
                  linkContext="blog sidebar"
                >
                  All articles
                </SafeInternalLink>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <SafeInternalLink
                    href={`/blog/category/${c.slug}`}
                    className="text-sm font-medium text-zinc-700 underline-offset-4 hover:text-blue-800 hover:underline"
                    linkContext="blog sidebar category"
                  >
                    {c.name}
                  </SafeInternalLink>
                </li>
              ))}
            </ul>
          </nav>
        </SidebarSection>
      ) : null}

      <SidebarSection title="Start exploring">
        <ul className="space-y-3">
          {BLOG_START_HERE_CARDS.map((card) => (
            <li key={card.href}>
              <SafeInternalLink
                href={card.href}
                className="group block rounded-lg border border-transparent px-1 py-1 transition hover:border-blue-100 hover:bg-blue-50/60"
                linkContext="blog sidebar start here"
              >
                <span className="text-sm font-semibold text-zinc-900 group-hover:text-blue-900">{card.title}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-zinc-600">{card.cta}</span>
              </SafeInternalLink>
            </li>
          ))}
        </ul>
      </SidebarSection>

      <div className="rounded-xl border border-zinc-200/90 bg-gradient-to-br from-zinc-50 to-white p-5 shadow-sm">
        <p className="text-sm font-semibold text-zinc-900">Book a service</p>
        <p className="mt-2 text-sm leading-relaxed text-zinc-600">
          Instant quote for Cape Town—pick rooms, tier, and add-ons.
        </p>
        <GrowthCtaLink
          href="/booking"
          source={`blog_${trackingSlug}_sidebar_book`}
          blogAnalyticsPlacement={`${trackingSlug}_sidebar_book`}
          className="mt-4 flex w-full min-h-11 items-center justify-center rounded-lg bg-blue-600 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          Book cleaning
        </GrowthCtaLink>
      </div>

      {trending.length > 0 ? (
        <SidebarSection title="Trending now">
          <ol className="list-none space-y-4">
            {trending.map((post, i) => (
              <li key={post.slug} className="flex gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <SafeInternalLink
                    href={`/blog/${post.slug}`}
                    className="text-sm font-semibold leading-snug text-zinc-900 underline-offset-4 hover:text-blue-800 hover:underline"
                    linkContext="blog sidebar trending"
                  >
                    {post.title}
                  </SafeInternalLink>
                  <p className="mt-1 text-xs text-zinc-500">{post.readingTime} min read</p>
                </div>
              </li>
            ))}
          </ol>
        </SidebarSection>
      ) : null}
    </aside>
  );
}
