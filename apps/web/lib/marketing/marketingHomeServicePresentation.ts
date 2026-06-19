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
  icon: LucideIcon;
  href: string;
  image: string;
  imageAlt: string;
};

const PRESENTATION: Record<MarketingHomeServiceKey, ServicePresentation> = {
  standard: {
    icon: Home,
    href: "/services/standard-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/standard-cleaning-cape-town-kitchen.webp"),
    imageAlt: "Regular home cleaning in a bright Cape Town kitchen",
  },
  deep: {
    icon: Droplets,
    href: "/services/deep-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/deep-cleaning-cape-town-kitchen.webp"),
    imageAlt: "Deep cleaning service in a Cape Town kitchen",
  },
  move: {
    icon: Truck,
    href: "/services/move-out-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/move-out-cleaning-cape-town-handover.webp"),
    imageAlt: "Move-in / move-out cleaning service in Cape Town",
  },
  airbnb: {
    icon: CalendarCheck,
    href: "/services/airbnb-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/airbnb-cleaning-cape-town-living-room.webp"),
    imageAlt: "Airbnb turnover cleaning in a Cape Town living room",
  },
  office: {
    icon: Building2,
    href: "/services/office-cleaning-cape-town",
    image: marketingLandingImage("/images/marketing/office-cleaning-cape-town-workspace.webp"),
    imageAlt: "Professional office cleaning in a Cape Town workspace",
  },
  carpet: {
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

/** Merge CMS `services` copy with checkout `pricing_services` base prices and static presentation assets. */
export function buildMarketingHomeServiceCards(services: MarketingHomeService[]): MarketingHomeServiceCard[] {
  const byId = new Map(services.map((s) => [s.id, s]));
  const cards: MarketingHomeServiceCard[] = [];

  for (const id of MARKETING_HOME_SERVICE_ORDER) {
    const row = byId.get(id);
    if (!row) continue;
    const pres = PRESENTATION[id];
    cards.push({
      id,
      title: row.title,
      description: row.description,
      priceLabel: formatMarketingHomeServicePrice(row.price),
      icon: pres.icon,
      href: pres.href,
      image: row.imageUrl?.trim() ? row.imageUrl : pres.image,
      imageAlt: pres.imageAlt,
    });
  }

  return cards;
}
