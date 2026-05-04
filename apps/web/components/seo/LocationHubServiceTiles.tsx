"use client";

import Link from "next/link";
import { trackSeoServiceCardClick } from "@/lib/analytics/track";
import type { SeoLocationAnalyticsBase } from "@/lib/analytics/track";

type Tile = { href: string; label: string };

type Props = {
  tiles: readonly Tile[];
  ctx: SeoLocationAnalyticsBase;
};

export function LocationHubServiceTiles({ tiles, ctx }: Props) {
  return (
    <ul className="mt-8 grid gap-3 sm:grid-cols-3">
      {tiles.map((tile) => (
        <li key={tile.href}>
          <Link
            href={tile.href}
            className="block rounded-2xl border border-emerald-100 bg-white p-5 text-base font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50/50"
            onClick={() =>
              trackSeoServiceCardClick({
                click_type: "tile",
                service_name: tile.label,
                surface: "location_hub",
                href: tile.href,
                page_slug: ctx.page_slug,
                suburb: ctx.suburb,
              })
            }
          >
            {tile.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
