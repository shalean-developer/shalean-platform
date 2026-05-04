import Link from "next/link";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { getLocationGeoHints } from "@/lib/seo/location-geo-enrichment";
import { nearbyProgrammaticLocations, type ProgrammaticLocation } from "@/lib/seo/locations";
import { linkEmphasisClassName } from "@/lib/ui/linkClassNames";

const PROPERTY_LABELS: Record<string, string> = {
  apartment: "apartments",
  family_home: "family homes",
  short_stay: "short-stay lets",
  luxury_home: "larger homes",
  student_share: "student flats and shares",
  townhouse: "townhouses",
};

function formatPropertyTypes(types: readonly CapeTownLocationRow["propertyTypes"][number][]): string {
  const labels = types.map((t) => PROPERTY_LABELS[t] ?? t);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatNearbySentence(nearby: ProgrammaticLocation[]): string {
  if (nearby.length === 0) return "";
  const names = nearby.map((l) => l.name);
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

type Props = {
  location: CapeTownLocationRow;
  slug: string;
};

/** Landmark + property + sibling suburb mentions for topical/local entity reinforcement. */
export function LocationHubEntityStack({ location, slug }: Props) {
  const geo = getLocationGeoHints(slug);
  const nearby = nearbyProgrammaticLocations(slug, 5);
  const nearbySentence = formatNearbySentence(nearby);
  const propSentence = formatPropertyTypes(location.propertyTypes);

  const landmarkBits = geo?.landmarks?.length ? geo.landmarks.slice(0, 4).join(", ") : null;

  return (
    <section className="border-b border-zinc-100 bg-zinc-50/40 py-14" aria-labelledby="hub-entity-stack-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-entity-stack-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Local relevance in {location.name}
        </h2>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-zinc-700">
          {landmarkBits ? (
            <p>
              Crews regularly reference <span className="font-medium text-zinc-900">{landmarkBits}</span> when routing —
              mention your building or street context in booking notes so scope matches on-the-ground layouts.
            </p>
          ) : null}
          {propSentence ? (
            <p>
              Typical bookings here span <span className="font-medium text-zinc-900">{propSentence}</span>
              {location.region ? (
                <>
                  {" "}
                  across <span className="font-medium text-zinc-900">{location.region}</span>
                </>
              ) : null}
              —tell us lifts, stairs, and outdoor zones when they affect mop lines or balcony dust.
            </p>
          ) : null}
          {nearbySentence ? (
            <p>
              Also serving nearby areas like{" "}
              {nearby.map((loc, i) => (
                <span key={loc.slug}>
                  {i > 0 ? (i === nearby.length - 1 ? ", and " : ", ") : null}
                  <Link href={`/locations/${loc.slug}`} className={`font-medium ${linkEmphasisClassName}`}>
                    {loc.name}
                  </Link>
                </span>
              ))}
              . Each hub keeps the same Cape Town-wide guides — pick your suburb for context, then lock your quote.
            </p>
          ) : (
            <p>
              Browse{" "}
              <Link href="/locations" className={linkEmphasisClassName}>
                all suburb hubs
              </Link>{" "}
              for neighbouring coverage and booking paths.
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
