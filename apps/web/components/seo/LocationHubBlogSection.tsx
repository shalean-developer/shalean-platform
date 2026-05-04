import Link from "next/link";
import type { HubBlogCard } from "@/lib/blog/get-all-posts";
import { ArrowUpRight } from "lucide-react";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  locationName: string;
  /** `/locations/[slug]` — strengthens hub ↔ blog crawl paths. */
  locationSlug: string;
  cards: HubBlogCard[];
};

export function LocationHubBlogSection({ locationName, locationSlug, cards }: Props) {
  if (cards.length === 0) return null;

  return (
    <section className="border-b border-zinc-100 py-16" aria-labelledby="location-blog-guides-heading">
      <div className="mx-auto max-w-4xl px-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 id="location-blog-guides-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
              Cleaning guides for {locationName}
            </h2>
            <p className="mt-2 text-base leading-relaxed text-zinc-600">
              Local service explainers plus Cape-wide pricing and how-to articles—then book with the same upfront quote
              flow from this hub.
            </p>
            <p className="mt-2 text-sm text-zinc-600">
              Hub:{" "}
              <Link href={`/locations/${locationSlug}`} className={`font-semibold ${linkEmphasisClassName}`}>
                Cleaning services in {locationName}
              </Link>
              {" · "}
              <Link href="/locations/cape-town-cleaning-services" className={`font-semibold ${linkEmphasisClassName}`}>
                Cape Town overview
              </Link>
            </p>
          </div>
          <Link href="/blog" className={`text-sm font-semibold ${linkEmphasisClassName}`}>
            View all articles
          </Link>
        </div>
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {cards.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/blog/${post.slug}`}
                className="group flex h-full flex-col rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm transition hover:border-emerald-200 hover:shadow-md"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-base font-semibold text-zinc-900 group-hover:text-emerald-800">{post.title}</h3>
                  <ArrowUpRight className="h-4 w-4 shrink-0 text-zinc-400 group-hover:text-emerald-700" aria-hidden />
                </div>
                <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-zinc-600">{post.excerpt}</p>
                <span className="mt-4 text-sm font-medium text-emerald-700">Read guide</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
