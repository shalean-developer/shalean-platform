import { MARKETING_SERVICE_NAV_LINKS } from "@/lib/marketing/marketingServiceNavLinks";
import { CLEANING_PRICES_CAPE_TOWN_PATH } from "@/lib/seo/marketingCleaningPricesHubMeta";

export const MARKETING_HEADER_NAV = {
  services: "/services",
  pricing: CLEANING_PRICES_CAPE_TOWN_PATH,
  about: "/about",
  help: "/faq",
  contact: "/contact",
} as const;

export type MarketingHeaderNavLink = { label: string; href: string; dropdown?: boolean };

export const MARKETING_HEADER_NAV_LINKS: MarketingHeaderNavLink[] = [
  { label: "Services", href: MARKETING_HEADER_NAV.services, dropdown: true },
  { label: "Pricing", href: MARKETING_HEADER_NAV.pricing },
  { label: "About Us", href: MARKETING_HEADER_NAV.about },
  { label: "Help Centre", href: MARKETING_HEADER_NAV.help },
  { label: "Contact Us", href: MARKETING_HEADER_NAV.contact },
];

/** Header/mobile navigation presents only the six primary services plus All Services. */
export const MARKETING_HEADER_SERVICE_LINKS = MARKETING_SERVICE_NAV_LINKS
  .filter(({ label }) => label !== "Window Cleaning")
  .map(({ label, href }) => [label, href] as const);

export const marketingHeaderNavLinkClass =
  "flex items-center gap-1 rounded-[var(--ui-radius-md)] px-[var(--ui-space-3)] py-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-medium text-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
