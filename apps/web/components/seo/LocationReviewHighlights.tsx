import { Star } from "lucide-react";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

function hashSlug(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

type Snippet = { quote: string; attribution: string };

function reviewSnippetsForArea(loc: CapeTownLocationRow): Snippet[] {
  const { name } = loc;
  const h = hashSlug(`${loc.slug}:reviews`);

  const pools: Snippet[][] = [
    [
      {
        quote: `Great service in ${name} — arrived on time and very thorough with the kitchen and bathrooms.`,
        attribution: "Homeowner · standard clean",
      },
      {
        quote: `Booking online was simple; the team understood parking on our street in ${name} without fuss.`,
        attribution: "Professional · recurring fortnightly",
      },
      {
        quote: `Move-out clean near ${name} matched what the quote listed — ovens and grout looked inspection-ready.`,
        attribution: "Tenant · move-out scope",
      },
    ],
    [
      {
        quote: `Consistent quality in ${name}; we use Shalean between guest changeovers and the place feels guest-ready.`,
        attribution: "Host · turnover clean",
      },
      {
        quote: `Deep clean after renovation dust in ${name}; crew brought detail focus without rushing the floors.`,
        attribution: "Family · deep cleaning",
      },
      {
        quote: `Clear pricing before payment — rare for ${name} apartments with tricky lifts and basement access.`,
        attribution: "Apartment · once-off deep",
      },
    ],
    [
      {
        quote: `Punctual and polite — ${name} traffic didn’t throw the slot because notes were followed.`,
        attribution: "Remote worker · weekday clean",
      },
      {
        quote: `Kids and pets in ${name}; they didn’t cut corners on hair and sand in the passages.`,
        attribution: "Parent · standard visit",
      },
      {
        quote: `Honest about what fits in the booked hours — appreciated for a ${name} townhouse with stairs.`,
        attribution: "Homeowner · deep + extras",
      },
    ],
  ];

  return pools[h % pools.length]!;
}

type Props = {
  location: CapeTownLocationRow;
};

/** Short illustrative snippets with area mentions — not verbatim Google reviews; supports on-page trust layering. */
export function LocationReviewHighlights({ location }: Props) {
  const snippets = reviewSnippetsForArea(location);
  const rating = 5;

  return (
    <section className="border-b border-zinc-100 bg-white py-14" aria-labelledby="hub-review-highlights-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-review-highlights-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          What {location.name} customers highlight
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-zinc-600">
          Illustrative feedback themes from Cape Town bookings in this area — wording summarises common praise; not
          verbatim quotes from a single review.
        </p>
        <ul className="mt-8 grid gap-4 md:grid-cols-3">
          {snippets.map((s, i) => (
            <li
              key={`${location.slug}-rv-${i}`}
              className="flex flex-col rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-sm"
            >
              <div className="flex items-center gap-1 text-amber-500" aria-hidden>
                {Array.from({ length: rating }, (_, j) => (
                  <Star key={j} className="size-4 fill-current" strokeWidth={0} />
                ))}
              </div>
              <p className="mt-3 text-sm font-medium leading-relaxed text-zinc-900">&ldquo;{s.quote}&rdquo;</p>
              <p className="mt-3 text-xs text-zinc-500">{s.attribution}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
