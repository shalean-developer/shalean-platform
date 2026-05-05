import type { CapeTownLocationRow } from "@/lib/seo/capeTownLocations";

/** Primary query pattern targeted on hub pages (title, H1, lead copy). */
export function primaryLocationKeywordPhrase(row: Pick<CapeTownLocationRow, "name" | "city">): string {
  return `Home cleaning services in ${row.name}, ${row.city}`;
}

export function introContainsPrimaryKeyword(text: string, row: Pick<CapeTownLocationRow, "name">): boolean {
  const t = text.toLowerCase();
  const n = row.name.toLowerCase();
  return t.includes(`home cleaning services in ${n}`) || t.includes(`cleaning services in ${n}`);
}

/** Prepends the primary phrase when meta descriptions omit it (keeps editorial body intact). */
export function ensureMetaDescriptionKeyword(
  description: string,
  row: Pick<CapeTownLocationRow, "name" | "city">,
): string {
  const trimmed = description.trim();
  if (!trimmed) return primaryLocationKeywordPhrase(row);
  const low = trimmed.toLowerCase();
  const n = row.name.toLowerCase();
  if (low.includes(`home cleaning services in ${n}`) || low.includes(`cleaning services in ${n}`)) return trimmed;
  return `${primaryLocationKeywordPhrase(row)}. ${trimmed}`;
}
