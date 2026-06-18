import Link from "next/link";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import type { HubContentTier } from "@/lib/seo/location-priority";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { GrowthCtaLink } from "@/components/growth/GrowthCtaLink";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

type Props = {
  location: CapeTownLocationRow;
  slug: string;
  tier: HubContentTier;
};

/**
 * Targets high-intent modifiers (deep / same-day / move-out / apartments) with crawlable internal anchors + links.
 */
export function LocationHubQueryExpansion({ location, slug, tier }: Props) {
  const { name, city } = location;
  const deep = CAPE_TOWN_SERVICE_SEO["deep-cleaning-cape-town"].path;
  const moveOut = CAPE_TOWN_SERVICE_SEO["move-out-cleaning-cape-town"].path;
  const standard = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;
  const airbnb = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;

  const dense = tier === "base";

  const blocks = [
    {
      id: "deep-cleaning",
      title: `Deep cleaning in ${name}`,
      body: dense
        ? `Kitchen degrease, bathrooms, and detail zones when ${name} homes need more than a tidy.`
        : `Deep cleaning resets ovens, grout-adjacent zones, and bathrooms after busy seasons—ideal before guests, handovers, or when ${name} kitchens have fallen behind standard upkeep.`,
      links: [
        { href: deep, label: `Deep cleaning guide (${city})` },
        { href: "#location-hub-faq", label: "FAQ: pricing & scope" },
      ],
    },
    {
      id: "same-day-cleaning",
      title: `Same-day cleaning in ${name}`,
      body: dense
        ? `See live availability for ${name}—urgent slots depend on cleaner routing that day.`
        : `Same-day or next-day cleans open when routing allows: lock bedrooms, bathrooms, and extras online so ${name} bookings dispatch with the checklist you approved.`,
      links: [
        {
          href: "/book",
          label: "Check live slots & pricing",
          growthSource: `seo_loc_${slug}_query_same_day`,
        },
      ],
    },
    {
      id: "move-out-cleaning",
      title: `Move-out cleaning in ${name}`,
      body: dense
        ? `Inspection-ready wet areas and kitchens for ${name} rentals.`
        : `Move-out visits prioritise kitchens, bathrooms, floors, and dust-downs landlords photograph—pair with accurate room counts so ${name} quotes match inspection expectations.`,
      links: [
        { href: moveOut, label: `Move-out cleaning (${city})` },
        { href: "#location-hub-faq", label: "Related FAQs" },
      ],
    },
    {
      id: "apartment-cleaning",
      title: `Apartment cleaning in ${name}`,
      body: dense
        ? `Lifts, parking, and compact layouts—scoped ${name} apartment cleans.`
        : `Apartments across ${name} benefit from stair/lift notes and realistic wet-area time—standard cycles maintain kitchens and bathrooms; deep visits tackle build-up before handovers or guests.`,
      links: [
        { href: standard, label: `Standard cleaning (${city})` },
        { href: airbnb, label: `Airbnb turnovers (${city})` },
      ],
    },
  ];

  return (
    <section
      className="border-b border-zinc-100 bg-white py-16"
      aria-labelledby="location-query-expansion-heading"
    >
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="location-query-expansion-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Popular cleaning searches in {name}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Long-tail queries map to the same upfront quote flow—pick the intent that matches your week, then confirm your{" "}
          {name} address at checkout.
        </p>
        <div className={`mt-10 grid gap-6 ${dense ? "sm:grid-cols-2" : "sm:grid-cols-2"}`}>
          {blocks.map((b) => (
            <div key={b.id} className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-zinc-900">{b.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600">{b.body}</p>
              <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
                {b.links.map((l) =>
                  "growthSource" in l && l.growthSource ? (
                    <li key={l.href + l.label}>
                      <GrowthCtaLink
                        href={l.href}
                        source={l.growthSource}
                        className={`text-sm font-semibold ${linkEmphasisClassName}`}
                      >
                        {l.label}
                      </GrowthCtaLink>
                    </li>
                  ) : (
                    <li key={l.href + l.label}>
                      <Link href={l.href} className={`text-sm font-semibold ${linkEmphasisClassName}`}>
                        {l.label}
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
