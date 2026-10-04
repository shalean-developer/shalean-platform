import Link from "next/link";
import {
  CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF,
  CAPE_TOWN_PRICING_AUTHORITY_HREF,
} from "@/lib/seo/internalLinks";
import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";
import { SEO_REBUILD_SUPPRESS_LOCATION_HUB_LINKS } from "@/lib/seo/seoRebuildPhase1";
import { cn } from "@/lib/utils";

/** Pricing education URL used for supporting cost context. */
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
  showTitle?: boolean;
};

/** Reusable crawl + UX block for pricing, services, locations and support paths. */
export function SeoInternalLinksBlock({
  title = "Related pages",
  items = DEFAULT_ITEMS,
  className,
  listClassName,
  showTitle = true,
}: Props) {
  return (
    <nav aria-label={title} className={cn("text-[length:var(--ui-text-small)] text-muted-foreground", className)}>
      {showTitle ? <p className="text-[length:var(--ui-text-card-title)] font-semibold text-foreground">{title}</p> : null}
      <ul
        className={cn(
          "flex flex-wrap gap-x-[var(--ui-space-4)] gap-y-[var(--ui-space-3)]",
          showTitle && "mt-[var(--ui-space-4)]",
          listClassName,
        )}
      >
        {items.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="font-medium text-primary underline decoration-primary/25 underline-offset-4 transition hover:decoration-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
