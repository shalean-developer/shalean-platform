import Link from "next/link";

import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { peerLocationHubsInRegion } from "@/lib/seo/location-region-peers";
type Props = {
  location: CapeTownLocationRow;
};

export function LocationHubRegionPeersSection({ location }: Props) {
  const peers = peerLocationHubsInRegion(location);
  if (peers.length === 0) return null;

  return (
    <section className="border-b border-zinc-100 bg-zinc-50/50 py-14" aria-labelledby="hub-region-cluster-heading">
      <div className="mx-auto max-w-4xl px-4">
        <h2 id="hub-region-cluster-heading" className="text-2xl font-bold tracking-tight text-zinc-900">
          Cleaning services in {location.region}
        </h2>
        <p className="mt-3 text-base leading-relaxed text-zinc-600">
          Shalean maps bookings by suburb and region across {location.city}. Nearby {location.region.toLowerCase()}{" "}
          hubs you can compare before booking:
        </p>
        <ul className="mt-6 flex flex-wrap gap-2">
          {peers.map((p) => (
            <li key={p.slug}>
              <Link
                href={`/locations/${p.slug}`}
                className="inline-flex rounded-full border border-emerald-200 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-400 hover:bg-emerald-50"
              >
                {p.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
