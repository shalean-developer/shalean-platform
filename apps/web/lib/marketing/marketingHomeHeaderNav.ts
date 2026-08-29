import { MARKETING_SERVICE_NAV_LINKS } from "@/lib/marketing/marketingServiceNavLinks";
import { CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF } from "@/lib/seo/internalLinks";

export const MARKETING_HEADER_NAV = {
  services: "/services",
  pricing: CAPE_TOWN_PRICING_EDUCATION_BLOG_HREF,
  about: "/about",
  help: "/faq",
  contact: "/contact",
} as const;

export type MarketingHeaderNavLink = { label: string; href: string; dropdown?: boolean };

export const MARKETING_HEADER_NAV_LINKS: MarketingHeaderNavLink[] = [
  { label: "Services", href: MARKETING_HEADER_NAV.services, dropdown: true },
  { label: "Pricing", href: MARKETING_HEADER_NAV.pricing },
  { label: "About", href: MARKETING_HEADER_NAV.about },
  { label: "FAQ", href: MARKETING_HEADER_NAV.help },
  { label: "Contact", href: MARKETING_HEADER_NAV.contact },
];

export const MARKETING_HEADER_SERVICE_LINKS = MARKETING_SERVICE_NAV_LINKS.map(
  ({ label, href }) => [label, href] as const,
);

export const marketingHeaderNavLinkClass =
  "flex items-center gap-1 rounded-[var(--ui-radius-md)] px-[var(--ui-space-3)] py-[var(--ui-space-2)] text-[length:var(--ui-text-small)] font-medium text-foreground transition-colors duration-150 hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";
