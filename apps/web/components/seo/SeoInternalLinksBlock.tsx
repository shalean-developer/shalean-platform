import Link from "next/link";
import { CAPE_TOWN_LOCATIONS_OVERVIEW_PATH } from "@/lib/seo/capeTownLocations";
import { cn } from "@/lib/utils";

/** Canonical paths for the SEO hub loop — extend when new money pages ship. */
export const SEO_HUB_CLEANING_PRICES_PATH = "/cleaning-prices-cape-town";
export const SEO_HUB_MAID_SERVICES_PATH = "/maid-services-cape-town";

export type SeoInternalLinksBlockItem = { href: string; label: string };

const DEFAULT_ITEMS: readonly SeoInternalLinksBlockItem[] = [
  { href: CAPE_TOWN_LOCATIONS_OVERVIEW_PATH, label: "Cleaning services Cape Town" },
  { href: SEO_HUB_CLEANING_PRICES_PATH, label: "Cleaning prices in Cape Town" },
  { href: SEO_HUB_MAID_SERVICES_PATH, label: "Maid services in Cape Town" },
  { href: "/services", label: "Cleaning services" },
  { href: "/locations", label: "Cleaning by suburb" },
  { href: "/booking/details", label: "Instant quote" },
];

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
