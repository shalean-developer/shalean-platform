import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";
import { getLocationMetaPriceHint } from "@/lib/seo/location-pricing";

export function locationHeroCtaMicrocopy(row: CapeTownLocationRow): string {
  const hint = getLocationMetaPriceHint(row);
  return `Instant quote · typical scopes from ${hint} · same-week slots when demand allows`;
}

export function locationFooterCtaMicrocopy(row: CapeTownLocationRow): string {
  return `See your total for ${row.name} before you pay—adjust rooms and add-ons until the price matches your visit.`;
}

export function locationStickyCtaLine(row: CapeTownLocationRow): string {
  const hint = getLocationMetaPriceHint(row);
  return `${row.name}: locked pricing from ${hint} · book today`;
}
