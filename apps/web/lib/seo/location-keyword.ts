import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

/** Primary query pattern targeted on hub pages (title, H1, lead copy). */
export function primaryLocationKeywordPhrase(row: Pick<CapeTownLocationRow, "name" | "city">): string {
  return `Cleaning services in ${row.name}, ${row.city}`;
}

export function introContainsPrimaryKeyword(text: string, row: Pick<CapeTownLocationRow, "name">): boolean {
  const needle = `cleaning services in ${row.name}`.toLowerCase();
  return text.toLowerCase().includes(needle);
}

/** Prepends the primary phrase when meta descriptions omit it (keeps editorial body intact). */
export function ensureMetaDescriptionKeyword(
  description: string,
  row: Pick<CapeTownLocationRow, "name" | "city">,
): string {
  const trimmed = description.trim();
  if (!trimmed) return primaryLocationKeywordPhrase(row);
  if (trimmed.toLowerCase().includes(`cleaning services in ${row.name.toLowerCase()}`)) return trimmed;
  return `${primaryLocationKeywordPhrase(row)}. ${trimmed}`;
}
