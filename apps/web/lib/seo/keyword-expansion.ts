import { LOCATIONS } from "@/lib/locations";
import { CAPE_TOWN_SEO_SERVICE_SLUGS } from "@/lib/seo/capeTownSeoPages";

const PREFIX_MODIFIERS = [
  "best",
  "affordable",
  "cheap",
  "professional",
  "trusted",
  "top rated",
  "same day",
  "same-week",
  "local",
  "residential",
  "home",
  "apartment",
] as const;

const SUFFIX_MODIFIERS = [
  "prices",
  "cost",
  "rates",
  "near me",
  "booking",
  "online booking",
  "services",
  "company",
  "reviews",
  "same day",
  "this week",
] as const;

const COMPARISON_PHRASES = [
  "vs standard cleaning",
  "compared to regular cleaning",
  "how much does it cost",
  "what is included",
] as const;

function uniq(strings: string[]): string[] {
  const s = new Set<string>();
  for (const x of strings) {
    const t = x.trim().replace(/\s+/g, " ");
    if (t.length > 2) s.add(t);
  }
  return [...s];
}

function serviceKeyFromSeoSlug(seo: string): string {
  return seo.replace(/-cape-town$/u, "");
}

function serviceDisplayName(key: string): string {
  return key
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Expands a head-term phrase into long-tail and modifier variants for gap analysis and queue scoring.
 * Does not guarantee unique slugs — pairing with `findContentGaps` / matrix topics is downstream.
 */
export function generateKeywordVariations(base: string): string[] {
  const root = base.trim().toLowerCase().replace(/\s+/g, " ");
  if (!root) return [];

  const out: string[] = [root];

  for (const p of PREFIX_MODIFIERS) {
    out.push(`${p} ${root}`);
  }
  for (const s of SUFFIX_MODIFIERS) {
    out.push(`${root} ${s}`);
  }
  for (const c of COMPARISON_PHRASES) {
    out.push(`${root} ${c}`);
  }

  const cityTokens = ["cape town", "johannesburg"] as const;
  const hasCity = cityTokens.some((c) => root.includes(c));

  if (hasCity) {
    const citySlug = root.includes("johannesburg") ? "johannesburg" : "cape-town";
    const suburbs = LOCATIONS.filter((l) => l.citySlug === citySlug && l.slug !== l.citySlug);
    for (const loc of suburbs) {
      const ln = loc.name.toLowerCase();
      const servicePart = root.replace(/cape town|johannesburg/gi, "").trim();
      if (servicePart) {
        out.push(`${servicePart} ${ln}`);
        out.push(`${servicePart} ${ln} ${loc.cityName.toLowerCase()}`);
        out.push(`${ln} ${servicePart}`);
        for (const p of PREFIX_MODIFIERS.slice(0, 6)) {
          out.push(`${p} ${servicePart} ${ln}`);
        }
      }
    }
  }

  const serviceKeys = CAPE_TOWN_SEO_SERVICE_SLUGS.map(serviceKeyFromSeoSlug);
  for (const key of serviceKeys) {
    const label = serviceDisplayName(key).toLowerCase();
    if (root.includes(label) || label.includes(root.split(" ").slice(0, 3).join(" "))) continue;
    for (const city of ["cape town", "johannesburg"] as const) {
      out.push(`${label} ${city}`);
    }
  }

  return uniq(out);
}
