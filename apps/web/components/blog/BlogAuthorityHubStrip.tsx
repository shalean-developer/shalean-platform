import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import {
  CANONICAL_MOVE_OUT_CHECKLIST_BLOG_HREF,
} from "@/lib/blog/canonicalEditorialBlogLinks";
import { getBlogServiceType } from "@/lib/blog/getBlogServiceType";
import { CAPE_TOWN_PRICING_AUTHORITY_HREF } from "@/lib/seo/internalLinks";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH } from "@/lib/seo/capeTownLocations";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = { slug: string };

const S = CAPE_TOWN_SERVICE_SEO;

/** One crawl-friendly strip: money pages + suburb hub + city hub (no generic “read more”). */
export function BlogAuthorityHubStrip({ slug }: Props) {
  const kind = getBlogServiceType(slug);

  if (kind === "pricing") {
    return (
      <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
        Compare live bands on{" "}
        <SafeInternalLink href={CAPE_TOWN_PRICING_AUTHORITY_HREF} className={`font-semibold ${linkEmphasisClassName}`}>
          cleaning prices in Cape Town
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
        for reset scope—Southern Suburbs crews often route from{" "}
        <SafeInternalLink href="/locations/claremont-cleaning-services" className={`font-semibold ${linkEmphasisClassName}`}>
          Claremont cleaning services
        </SafeInternalLink>{" "}
        and the wider{" "}
        <SafeInternalLink href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={`font-semibold ${linkEmphasisClassName}`}>
          Cape Town cleaning hub
        </SafeInternalLink>
        .
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
        —Seaboard hosts often start from{" "}
        <SafeInternalLink href="/locations/sea-point-cleaning-services" className={`font-semibold ${linkEmphasisClassName}`}>
          Sea Point cleaning services
        </SafeInternalLink>{" "}
        before branching to other{" "}
        <SafeInternalLink href="/locations" className={`font-semibold ${linkEmphasisClassName}`}>
          suburb hubs
        </SafeInternalLink>
        .
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
        , then confirm suburb context via{" "}
        <SafeInternalLink href="/locations" className={`font-semibold ${linkEmphasisClassName}`}>
          all location hubs
        </SafeInternalLink>
        .
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
        to a standard visit when fibres need extraction—browse{" "}
        <SafeInternalLink href="/locations" className={`font-semibold ${linkEmphasisClassName}`}>
          suburb hubs
        </SafeInternalLink>{" "}
        for local access notes.
      </p>
    );
  }

  return (
    <p className="not-prose mt-4 max-w-3xl text-sm leading-relaxed text-zinc-600">
      Most guides tie back to{" "}
      <SafeInternalLink href={S["standard-cleaning-cape-town"].path} className={`font-semibold ${linkEmphasisClassName}`}>
        standard home cleaning in Cape Town
      </SafeInternalLink>{" "}
      and the{" "}
      <SafeInternalLink href={CAPE_TOWN_LOCATIONS_OVERVIEW_PATH} className={`font-semibold ${linkEmphasisClassName}`}>
        citywide cleaning hub
      </SafeInternalLink>
      —open{" "}
      <SafeInternalLink href="/locations" className={`font-semibold ${linkEmphasisClassName}`}>
        all suburb pages
      </SafeInternalLink>{" "}
      when you want hyperlocal access context.
    </p>
  );
}
