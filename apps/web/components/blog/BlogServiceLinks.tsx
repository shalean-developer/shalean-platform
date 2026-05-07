import Link from "next/link";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import type { BlogServiceLinkKind } from "@/lib/blog/getBlogServiceType";
import { getBlogIntentServicePair, getPricingBlogLink, getRelevantBlogLocationLinks } from "@/lib/seo/internalLinks";
import { linkInNavClassName } from "@/lib/ui/linkClassNames";

type Props = {
  /** Post slug — drives deterministic anchors + intent pairing. */
  trackingSlug: string;
  service?: BlogServiceLinkKind;
  /** Tighter top margin when stacked under contextual copy */
  dense?: boolean;
};

export function BlogServiceLinks({ trackingSlug, service = "standard", dense = false }: Props) {
  const key = trackingSlug.trim() || "blog";
  const serviceLinks = getBlogIntentServicePair(service, key);
  const locationLinks = getRelevantBlogLocationLinks(service, key);
  const pricing = getPricingBlogLink(key);

  const rows: { href: string; label: string }[] = [
    ...serviceLinks.map((l) => ({ href: l.href, label: l.anchor })),
    ...locationLinks.map((l) => ({ href: l.href, label: l.anchor })),
    { href: pricing.href, label: pricing.anchor },
  ];

  return (
    <section
      className={`not-prose rounded-2xl border border-zinc-200/90 bg-zinc-50/70 px-5 py-6 shadow-sm sm:px-6 sm:py-7 ${dense ? "mt-0" : "mt-12"}`}
      aria-labelledby="blog-service-links-heading"
    >
      <h2 id="blog-service-links-heading" className="text-lg font-bold tracking-tight text-zinc-900">
        Related Cleaning Services in Cape Town
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-zinc-600">
        Explore Cape Town-wide service guides, high-intent suburb hubs, and pricing—then{" "}
        <GrowthCtaLink
          href="/booking"
          source={`blog_internal_links_book_${service}`}
          className="font-semibold text-blue-700 underline-offset-4 hover:text-blue-900 hover:underline"
        >
          book cleaning online in Cape Town
        </GrowthCtaLink>{" "}
        when you are ready.
      </p>
      <ul className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium text-zinc-800">
        {rows.map((item) => (
          <li key={item.href + item.label}>
            <Link href={item.href} className={linkInNavClassName}>
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
