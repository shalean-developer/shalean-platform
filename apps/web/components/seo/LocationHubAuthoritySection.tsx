import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import {
  buildLocationAuthorityAboutBlock,
  buildLocationRecentBookingExamples,
} from "@/lib/seo/location-hub-authority";
import {
  hubContentRefreshCadenceNote,
  hubOptionalContentReviewLine,
  hubRotatingFreshnessParagraph,
  locationHubContentCycleEpoch,
} from "@/lib/seo/location-hub-content-cycle";

type Props = {
  location: CapeTownLocationRow;
};

/** E-E-A-T block: operating narrative, network depth, illustrative recent bookings, freshness paragraph. */
export function LocationHubAuthoritySection({ location }: Props) {
  const epoch = locationHubContentCycleEpoch();
  const about = buildLocationAuthorityAboutBlock(location);
  const recent = buildLocationRecentBookingExamples(location, epoch);
  const freshness = hubRotatingFreshnessParagraph(location);
  const reviewed = hubOptionalContentReviewLine();

  return (
    <section className="border-b border-zinc-100 py-16" aria-labelledby="hub-authority-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-authority-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          {about.heading}
        </h2>
        <div className="mt-6 space-y-4 text-base leading-relaxed text-zinc-700">
          {about.paragraphs.map((p, i) => (
            <p key={`auth-${i}-${p.slice(0, 16)}`}>{p}</p>
          ))}
        </div>

        <h3 className="mt-10 text-lg font-bold text-zinc-900">Recent bookings in {location.name}</h3>
        <p className="mt-2 text-xs leading-relaxed text-zinc-500">
          Illustrative examples only — anonymised vignettes showing typical scopes routed near your suburb (not live order
          data).
        </p>
        <ul className="mt-4 space-y-3">
          {recent.map((ex, i) => (
            <li
              key={`recent-${i}-${ex.text.slice(0, 12)}`}
              className="rounded-xl border border-emerald-100 bg-emerald-50/40 px-4 py-3 text-sm leading-relaxed text-zinc-800"
            >
              {ex.text}
            </li>
          ))}
        </ul>

        <p className="mt-8 text-sm italic leading-relaxed text-zinc-600">{freshness}</p>
        <p className="mt-2 text-xs text-zinc-500">{hubContentRefreshCadenceNote()}</p>
        {reviewed ? <p className="mt-1 text-xs text-zinc-500">{reviewed}</p> : null}
      </div>
    </section>
  );
}
