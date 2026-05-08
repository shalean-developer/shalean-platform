import { SafeInternalLink } from "@/components/links/SafeInternalLink";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import {
  hubAreaKebabFromHubSlug,
  programmaticBlogHrefIfExists,
} from "@/lib/blog/programmaticPosts";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { nearbyProgrammaticLocations } from "@/lib/seo/locations";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type DepthRow = {
  title: string;
  description: string;
  serviceHref: string;
  serviceLabel: string;
  blogHref: string | null;
  blogLabel: string;
  hubHref: string | null;
  hubLabel: string | null;
};

function buildRows(slug: string, location: CapeTownLocationRow): DepthRow[] {
  const base = hubAreaKebabFromHubSlug(slug);
  const nearby = nearbyProgrammaticLocations(slug, 3).filter((l) => l.slug !== slug);
  const altHub = nearby[0];

  const deepBlog = programmaticBlogHrefIfExists(`deep-cleaning-${base}-cape-town`);
  const moveBlog = programmaticBlogHrefIfExists(`move-out-cleaning-${base}-cape-town`);
  const airbnbBlog = programmaticBlogHrefIfExists(`airbnb-cleaning-${base}-cape-town`);

  const deepService = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const moveService = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const airbnbService = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;

  return [
    {
      title: "Deep cleaning",
      description: `Heavy kitchens, bathrooms, and detail zones when ${location.name} homes need a reset—not just a tidy.`,
      serviceHref: deepService,
      serviceLabel: "Deep cleaning service (Cape Town)",
      blogHref: deepBlog,
      blogLabel: deepBlog ? `Deep cleaning guide · ${location.name}` : `Citywide deep cleaning guide`,
      hubHref: altHub ? `/locations/${altHub.slug}` : null,
      hubLabel: altHub ? `${altHub.name} hub` : null,
    },
    {
      title: "Move-out cleaning",
      description: `Inventory-ready ovens, grout lines, and bathrooms common before ${location.name} handovers.`,
      serviceHref: moveService,
      serviceLabel: "Move-out cleaning service",
      blogHref: moveBlog,
      blogLabel: moveBlog ? `Move-out cost guide · ${location.name}` : `Citywide move-out cleaning`,
      hubHref: altHub ? `/locations/${altHub.slug}` : null,
      hubLabel: altHub ? `Nearby: ${altHub.name}` : null,
    },
    {
      title: "Airbnb & turnover cleaning",
      description: `Guest-ready resets when checkout windows are tight around ${location.name}.`,
      serviceHref: airbnbService,
      serviceLabel: "Airbnb cleaning service",
      blogHref: airbnbBlog,
      blogLabel: airbnbBlog ? `Turnover tips · ${location.name}` : `Citywide Airbnb cleaning`,
      hubHref: nearby[1] ? `/locations/${nearby[1]!.slug}` : altHub ? `/locations/${altHub.slug}` : null,
      hubLabel: nearby[1] ? `${nearby[1]!.name} hub` : altHub ? `${altHub.name} hub` : null,
    },
  ];
}

type Props = {
  location: CapeTownLocationRow;
  slug: string;
};

/** End-of-page depth links — service + cluster blog + alternate hub to spread crawl paths. */
export function LocationHubSessionDepth({ location, slug }: Props) {
  const rows = buildRows(slug, location);

  return (
    <section className="border-b border-zinc-100 bg-emerald-50/30 py-16" aria-labelledby="hub-session-depth-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-session-depth-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          You may also need
        </h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Go deeper on related intents — each card links to a Cape Town service page, a local guide when published, and a
          neighbouring suburb hub for extra context.
        </p>
        <ul className="mt-8 grid gap-6 md:grid-cols-3">
          {rows.map((row) => (
            <li
              key={row.title}
              className="flex flex-col rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm"
            >
              <h3 className="text-lg font-bold text-zinc-900">{row.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-zinc-600">{row.description}</p>
              <ul className="mt-4 space-y-2 text-sm font-medium">
                <li>
                  <SafeInternalLink href={row.serviceHref} className={linkEmphasisClassName}>
                    {row.serviceLabel}
                  </SafeInternalLink>
                </li>
                <li>
                  {row.blogHref ? (
                    <SafeInternalLink href={row.blogHref} className={linkEmphasisClassName}>
                      {row.blogLabel}
                    </SafeInternalLink>
                  ) : (
                    <SafeInternalLink href="/blog" className={linkEmphasisClassName}>
                      Browse cleaning guides
                    </SafeInternalLink>
                  )}
                </li>
                {row.hubHref && row.hubLabel ? (
                  <li>
                    <SafeInternalLink href={row.hubHref} className={linkEmphasisClassName}>
                      {row.hubLabel}
                    </SafeInternalLink>
                  </li>
                ) : null}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
