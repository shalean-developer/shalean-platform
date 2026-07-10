import type { BlogContentBlock } from "@/lib/blog/content-json";

/** Keep in sync with `CAPE_TOWN_PRICING_AUTHORITY_HREF` (`internalLinks.ts`). */
const PRICING_AUTHORITY_PAGE = "/blog/how-much-does-cleaning-cost-cape-town-2026";

/** Post-level cap — avoids repetitive internal-link patterns across long articles. */
export const MAX_AUTO_LINKS_PER_POST = 5;

export type AutoLinkBudget = {
  inserted: number;
  urls: Set<string>;
};

export function createAutoLinkBudget(): AutoLinkBudget {
  return { inserted: 0, urls: new Set<string>() };
}

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
    href: "/cleaning-services-cape-town",
  },
  { pattern: /\bcleaning (?:prices|costs) in Cape Town\b/i, href: PRICING_AUTHORITY_PAGE },
];

function normHref(href: string): string {
  return href.replace(/\/+$/, "") || "/";
}

/**
 * Inserts markdown `[match](href)` for the **first** occurrence of each rule per paragraph,
 * honoring a shared post-level budget and **one link per target URL per post**.
 * Safe for trusted CMS copy only — runs before `[label](url)` parsing in `BlogContentRenderer`.
 */
export function injectMarkdownAutoLinks(text: string, budget?: AutoLinkBudget): string {
  const raw = typeof text === "string" ? text : String(text ?? "");
  const t = raw.trim();
  if (!t) return raw;
  if (budget && budget.inserted >= MAX_AUTO_LINKS_PER_POST) return text;

  let out = raw;
  for (const rule of RULES) {
    if (budget && budget.inserted >= MAX_AUTO_LINKS_PER_POST) break;
    const h = normHref(rule.href);
    if (budget?.urls.has(h)) continue;
    if (out.includes(`](${rule.href})`) || out.includes(`](${h})`)) continue;
    if (!out.match(rule.pattern)) continue;
    out = out.replace(rule.pattern, (full) => `[${full}](${rule.href})`);
    if (budget) {
      budget.inserted += 1;
      budget.urls.add(h);
    }
  }
  return out;
}

/** Apply paragraph auto-links with one shared budget (e.g. split before/after FAQ renders). */
export function injectParagraphAutoLinksIntoBlocks(
  blocks: BlogContentBlock[],
  budget: AutoLinkBudget,
): BlogContentBlock[] {
  return blocks.map((b) => {
    if (b.type !== "paragraph") return b;
    const paraText = typeof b.content === "string" ? b.content : String(b.content ?? "");
    return { ...b, content: injectMarkdownAutoLinks(paraText, budget) };
  });
}
