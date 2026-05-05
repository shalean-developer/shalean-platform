/** Keep in sync with `CAPE_TOWN_PRICING_BLOG_HREF` (`internalLinks.ts`). */
const PRICING_GUIDE_BLOG = "/blog/how-much-does-cleaning-cost-cape-town";

type Rule = { pattern: RegExp; href: string };

/** Longer / more specific phrases first so we do not partially steal matches. */
const RULES: Rule[] = [
  { pattern: /\bmove[- ]out cleaning\b/i, href: "/services/move-out-cleaning-cape-town" },
  { pattern: /\bdeep cleaning\b/i, href: "/services/deep-cleaning-cape-town" },
  { pattern: /\bAirbnb\s+turnover\s+cleaning\b/i, href: "/services/airbnb-cleaning-cape-town" },
  { pattern: /\bAirbnb\s+cleaning\b/i, href: "/services/airbnb-cleaning-cape-town" },
  { pattern: /\bcarpet cleaning\b/i, href: "/services/carpet-cleaning-cape-town" },
  { pattern: /\bwindow cleaning\b/i, href: "/services/window-cleaning-cape-town" },
  { pattern: /\boffice cleaning\b/i, href: "/services/office-cleaning-cape-town" },
  { pattern: /\bstandard cleaning\b/i, href: "/services/standard-cleaning-cape-town" },
  {
    pattern: /\bcleaning services in Cape Town\b/i,
    href: "/locations/cape-town-cleaning-services",
  },
  { pattern: /\bcleaning (?:prices|costs) in Cape Town\b/i, href: PRICING_GUIDE_BLOG },
];

/**
 * Inserts markdown `[match](href)` for the **first** occurrence of each rule per paragraph.
 * Safe for trusted CMS copy only — runs before `[label](url)` parsing in `BlogContentRenderer`.
 */
export function injectMarkdownAutoLinks(text: string): string {
  const t = text.trim();
  if (!t) return text;

  let out = text;
  for (const rule of RULES) {
    if (out.includes(`](${rule.href})`)) continue;
    if (!out.match(rule.pattern)) continue;
    out = out.replace(rule.pattern, (full) => `[${full}](${rule.href})`);
  }
  return out;
}
