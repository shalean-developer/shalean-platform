import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

type Props = {
  location: CapeTownLocationRow;
};

/** One concise block from `location-hubs.json` `serviceDemandProfile` — operational demand, not filler. */
export function LocationHubServiceDemandSection({ location }: Props) {
  const lines = location.serviceDemandProfile;
  if (!lines?.length) return null;

  return (
    <section className="border-b border-zinc-100 py-14" aria-labelledby="hub-service-demand-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-service-demand-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          What we book most often in {location.name}
        </h2>
        <ul className="mt-5 list-disc space-y-2 pl-5 text-base leading-relaxed text-zinc-700">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
