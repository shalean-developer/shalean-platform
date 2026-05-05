import { CAPE_TOWN_LOCATIONS, type CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

/** Same-region hubs excluding the current page — builds topical geo hierarchy on location templates. */
export function peerLocationHubsInRegion(location: CapeTownLocationRow, limit = 12): CapeTownLocationRow[] {
  return CAPE_TOWN_LOCATIONS.filter((l) => l.region === location.region && l.slug !== location.slug)
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, limit);
}
