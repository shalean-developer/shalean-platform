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
  "flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition-colors duration-150 hover:bg-blue-50 hover:text-blue-700";
