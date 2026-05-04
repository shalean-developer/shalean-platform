import Link from "next/link";
import { MapPin } from "lucide-react";
import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { cn } from "@/lib/utils";

type Props = {
  regionTitle: string;
  locations: readonly CapeTownLocationRow[];
  className?: string;
};

/**
 * Region block — grid of suburb links (no pill tags).
 */
export function LocationGroup({ regionTitle, locations, className }: Props) {
  if (locations.length === 0) return null;

  return (
    <section className={cn("scroll-mt-24", className)} aria-labelledby={`region-${slugify(regionTitle)}`}>
      <div className="flex items-center gap-2 border-b border-zinc-200 pb-3">
        <MapPin className="size-5 text-emerald-700" aria-hidden />
        <h2 id={`region-${slugify(regionTitle)}`} className="text-xl font-bold tracking-tight text-zinc-900">
          {regionTitle}
        </h2>
      </div>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {locations.map((loc) => (
          <li key={loc.slug}>
            <Link
              href={`/locations/${loc.slug}`}
              className="flex min-h-[3.25rem] items-center rounded-xl border border-zinc-200 bg-zinc-50/80 px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition hover:border-emerald-300 hover:bg-white hover:text-emerald-950"
            >
              {loc.name}
              <span className="ml-auto text-xs font-medium text-emerald-700">Hub →</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
