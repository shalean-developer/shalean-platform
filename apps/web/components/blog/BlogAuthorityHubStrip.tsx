import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import {
  CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF,
} from "@/lib/blog/canonicalEditorialBlogLinks";
import { getBlogServiceType } from "@/lib/blog/getBlogServiceType";
import { CAPE_TOWN_PRICING_AUTHORITY_HREF } from "@/lib/seo/internalLinks";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = { slug: string };

const S = CAPE_TOWN_SERVICE_SEO;

/** One crawl-friendly strip: money pages + booking path (no retired location hubs). */
export function BlogAuthorityHubStrip({ slug }: Props) {
  const kind = getBlogServiceType(slug);

  if (kind === "pricing") {
    return (
      <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
        Compare live bands on{" "}
        <SafeInternalLink href={CAPE_TOWN_PRICING_AUTHORITY_HREF} className={`font-semibold ${linkEmphasisClassName}`}>
          cleaning services and pricing
        </SafeInternalLink>
        , then open{" "}
        <SafeInternalLink href={S["standard-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
          standard home cleaning (Cape Town)
        </SafeInternalLink>{" "}
        when you are ready to lock rooms and add-ons.
      </p>
    );
  }

  if (kind === "deep") {
    return (
      <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
        Book{" "}
        <SafeInternalLink href={S["deep-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
          deep cleaning in Cape Town
        </SafeInternalLink>{" "}
        for reset scope, or pair with{" "}
        <SafeInternalLink href={S["standard-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
          standard home cleaning
        </SafeInternalLink>{" "}
        for recurring visits.
      </p>
    );
  }

  if (kind === "airbnb") {
    return (
      <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
        Match turnover scope on{" "}
        <SafeInternalLink href={S["airbnb-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
          Airbnb cleaning in Cape Town
        </SafeInternalLink>
        , then{" "}
        <SafeInternalLink href="/book" className={`font-semibold ${linkEmphasisClassName}`}>
          book online
        </SafeInternalLink>{" "}
        with your property address at checkout.
      </p>
    );
  }

  if (kind === "move-out") {
    return (
      <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
        Pair{" "}
        <SafeInternalLink href={S["move-out-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
          move-out cleaning in Cape Town
        </SafeInternalLink>{" "}
        with the{" "}
        <SafeInternalLink href={CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF} className={`font-semibold ${linkEmphasisClassName}`}>
          move-out cleaning checklist
        </SafeInternalLink>
        , then confirm your suburb when you book.
      </p>
    );
  }

  if (kind === "carpet") {
    return (
      <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
        Add{" "}
        <SafeInternalLink href={S["carpet-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
          carpet and upholstery care in Cape Town
        </SafeInternalLink>{" "}
        to a standard visit when fibres need extraction—see{" "}
        <SafeInternalLink href="/services" className={`font-semibold ${linkEmphasisClassName}`}>
          all services
        </SafeInternalLink>{" "}
        for scope options.
      </p>
    );
  }

  return (
    <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
      Most guides tie back to{" "}
      <SafeInternalLink href={S["standard-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
        standard home cleaning in Cape Town
      </SafeInternalLink>{" "}
      and the wider{" "}
      <SafeInternalLink href="/services" className={`font-semibold ${linkEmphasisClassName}`}>
        services overview
      </SafeInternalLink>
      —add your suburb at checkout for availability.
    </p>
  );
}
