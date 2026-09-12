import type { LucideIcon } from "lucide-react";
import { Building2, CalendarCheck, Droplets, Home, Layers, Truck } from "lucide-react";
import type { MarketingHomeService, MarketingHomeServiceKey } from "@/lib/home/data";
import { marketingLandingImage } from "@/lib/marketing/marketingHomeAssets";

/** Display order for homepage service chips and cards. */
export const MARKETING_HOME_SERVICE_ORDER: readonly MarketingHomeServiceKey[] = [
  "standard",
  "deep",
  "move",
  "airbnb",
  "office",
  "carpet",
];

type ServicePresentation = {
  title: string;
  defaultDescription: string;
  icon: LucideIcon;
  href: string;
  image: string;
  imageAlt: string;
};

/**
 * Canonical service identity is static so SEO-critical homepage links survive CMS/DB outages.
 * CMS copy, price, and optional image data enhance this presentation when available.
 */
const PRESENTATION: Record<MarketingHomeServiceKey, ServicePresentation> = {
  standard: {
    title: "Standard Cleaning",
    defaultDescription: "Routine home cleaning for kitchens, bathrooms, living areas and floors across Cape Town.",
    icon: Home,
    href: "/services/standard-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/standard-cleaning-cape-town-kitchen.webp"),
    imageAlt: "Regular home cleaning in a bright Cape Town kitchen",
  },
  deep: {
    title: "Deep Cleaning",
    defaultDescription: "Detailed one-off cleaning for homes that need more intensive attention than a standard clean.",
    icon: Droplets,
    href: "/services/deep-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/deep-cleaning-cape-town-kitchen.webp"),
    imageAlt: "Deep cleaning service in a Cape Town kitchen",
  },
  move: {
    title: "Move In / Out Cleaning",
    defaultDescription: "Move-in and move-out cleaning for handovers, empty homes and relocation days in Cape Town.",
    icon: Truck,
    href: "/services/move-out-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/move-out-cleaning-cape-town-handover.webp"),
    imageAlt: "Move-in / move-out cleaning service in Cape Town",
  },
  airbnb: {
    title: "Airbnb Cleaning",
    defaultDescription: "Turnover cleaning for Cape Town short-stay and Airbnb properties between guest bookings.",
    icon: CalendarCheck,
    href: "/services/airbnb-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/airbnb-cleaning-cape-town-living-room.webp"),
    imageAlt: "Airbnb turnover cleaning in a Cape Town living room",
  },
  office: {
    title: "Office Cleaning",
    defaultDescription: "Professional cleaning for Cape Town offices and workplace environments.",
    icon: Building2,
    href: "/services/office-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/office-cleaning-cape-town-workspace.webp"),
    imageAlt: "Professional office cleaning in a Cape Town workspace",
  },
  carpet: {
    title: "Carpet Cleaning",
    defaultDescription: "Specialist carpet cleaning for homes, rentals and workplaces across Cape Town.",
    icon: Layers,
    href: "/services/carpet-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/sofa-carpet-care-cape-town.webp"),
    imageAlt: "Carpet and upholstery cleaning in Cape Town",
  },
};

export type MarketingHomeServiceCard = {
  id: MarketingHomeServiceKey;
  title: string;
  description: string;
  priceLabel: string | null;
  icon: LucideIcon;
  href: string;
  image: string;
  imageAlt: string;
};

export function formatMarketingHomeServicePrice(price: number | null): string | null {
  if (price == null || !Number.isFinite(price)) return null;
  return `R${Math.round(price)}`;
}

/** Merge optional CMS/catalog data into the six canonical customer-facing services. */
export function buildMarketingHomeServiceCards(services: MarketingHomeService[]): MarketingHomeServiceCard[] {
  const byId = new Map(services.map((s) => [s.id, s]));

  return MARKETING_HOME_SERVICE_ORDER.map((id) => {
    const row = byId.get(id);
    const pres = PRESENTATION[id];
    return {
      id,
      title: pres.title,
      description: row?.description?.trim() || pres.defaultDescription,
      priceLabel: formatMarketingHomeServicePrice(row?.price ?? null),
      icon: pres.icon,
      href: pres.href,
      image: row?.imageUrl?.trim() ? row.imageUrl : pres.image,
      imageAlt: pres.imageAlt,
    };
  });
}
