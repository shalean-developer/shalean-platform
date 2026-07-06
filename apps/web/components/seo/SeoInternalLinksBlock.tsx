import Link from "next/link";
import {
  CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF,
  CAPE_TOWN_PRICING_AUTHORITY_HREF,
} from "@/lib/seo/internalLinks";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS } from "@/lib/seo/seoRebuildPhase1";
import { cn } from "@/lib/utils";

/** Live pricing education URL (retired `/cleaning-prices-cape-town` hub stays 410). */
export const SEO_HUB_CLEANING_PRICES_PATH = CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF;

/** Recurring-home intent — standard cleaning service page. */
export const SEO_HUB_MAID_SERVICES_PATH = CAPE_TOWN_SERVICE_SEO["standard-cleaning-cape-town"].path;

export type SeoInternalLinksBlockItem = { href: string; label: string };

const DEFAULT_ITEMS_PHASE1: readonly SeoInternalLinksBlockItem[] = [
  { href: CAPE_TOWN_PRICING_AUTHORITY_HREF, label: "Cleaning services in Cape Town" },
  { href: SEO_HUB_CLEANING_PRICES_PATH, label: "Cleaning prices in Cape Town" },
  { href: SEO_HUB_MAID_SERVICES_PATH, label: "Standard home cleaning" },
  { href: "/book", label: "Instant quote" },
  { href: "/blog", label: "Cleaning guides" },
  { href: "/faq", label: "Cleaning FAQs" },
];

const DEFAULT_ITEMS_PHASE2: readonly SeoInternalLinksBlockItem[] = [
  { href: CAPE_TOWN_PRICING_AUTHORITY_HREF, label: "Cleaning services in Cape Town" },
  { href: SEO_HUB_CLEANING_PRICES_PATH, label: "Cleaning prices in Cape Town" },
  { href: SEO_HUB_MAID_SERVICES_PATH, label: "Standard home cleaning" },
  { href: "/locations", label: "Cleaning by suburb" },
  { href: "/book", label: "Instant quote" },
  { href: "/blog", label: "Cleaning guides" },
  { href: "/faq", label: "Cleaning FAQs" },
];

const DEFAULT_ITEMS = SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS ? DEFAULT_ITEMS_PHASE1 : DEFAULT_ITEMS_PHASE2;

type Props = {
  title?: string;
  items?: readonly SeoInternalLinksBlockItem[];
  className?: string;
  listClassName?: string;
};

/**
 * Reusable crawl + UX block: keeps pricing ↔ services ↔ locations ↔ quote wired consistently.
 * Drop into service templates, location hubs, or blog footers with optional `items` overrides.
 */
export function SeoInternalLinksBlock({
  title = "Related pages",
  items = DEFAULT_ITEMS,
  className,
  listClassName,
}: Props) {
  return (
    <nav aria-label={title} className={cn("text-sm text-zinc-700", className)}>
      <p className="font-semibold text-zinc-900">{title}</p>
      <ul className={cn("mt-3 flex flex-wrap gap-x-4 gap-y-2", listClassName)}>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} className="font-medium text-blue-700 underline-offset-2 hover:underline">
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
