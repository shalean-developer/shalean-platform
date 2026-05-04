import { CAPE_TOWN_SERVICE_SEO } from "@/lib/seo/capeTownSeoPages";

export const AIRBNB_SERVICE_HREF = CAPE_TOWN_SERVICE_SEO["airbnb-cleaning-cape-town"].path;

export type AirbnbGuideCrossLinkBundle = {
  /** Exactly two other Airbnb guide posts */
  peerGuides: { href: string; label: string }[];
  /** One suburb hub for topical authority */
  locationHub: { href: string; label: string };
};

const BLOG = {
  checklist: { href: "/blog/airbnb-cleaning-checklist-cape-town", label: "Airbnb cleaning checklist (Cape Town)" },
  cost: { href: "/blog/airbnb-cleaning-cost-cape-town", label: "Airbnb cleaning cost in Cape Town" },
  prepare: { href: "/blog/prepare-airbnb-for-cleaning", label: "Prepare your Airbnb for cleaning" },
  tips: { href: "/blog/best-airbnb-cleaning-tips-cape-town", label: "Best Airbnb cleaning tips" },
  frequency: { href: "/blog/how-often-to-clean-airbnb-cape-town", label: "How often to clean an Airbnb" },
  mistakes: { href: "/blog/airbnb-cleaning-mistakes-hosts-make", label: "Airbnb cleaning mistakes hosts make" },
} as const;

const HUB = {
  seaPoint: { href: "/locations/sea-point-cleaning-services", label: "Sea Point cleaning services hub" },
  greenPoint: { href: "/locations/green-point-cleaning-services", label: "Green Point cleaning services hub" },
  claremont: { href: "/locations/claremont-cleaning-services", label: "Claremont cleaning services hub" },
  gardens: { href: "/locations/gardens-cleaning-services", label: "Gardens cleaning services hub" },
} as const;

/** Curated peer pairs + hub so every guide touches two articles + one suburb + central service (via separate CTA). */
const MATRIX: Record<string, AirbnbGuideCrossLinkBundle> = {
  "airbnb-cleaning-checklist-cape-town": {
    peerGuides: [BLOG.cost, BLOG.mistakes],
    locationHub: HUB.seaPoint,
  },
  "airbnb-cleaning-cost-cape-town": {
    peerGuides: [BLOG.frequency, BLOG.prepare],
    locationHub: HUB.greenPoint,
  },
  "prepare-airbnb-for-cleaning": {
    peerGuides: [BLOG.checklist, BLOG.tips],
    locationHub: HUB.claremont,
  },
  "best-airbnb-cleaning-tips-cape-town": {
    peerGuides: [BLOG.prepare, BLOG.cost],
    locationHub: HUB.gardens,
  },
  "how-often-to-clean-airbnb-cape-town": {
    peerGuides: [BLOG.tips, BLOG.mistakes],
    locationHub: HUB.seaPoint,
  },
  "airbnb-cleaning-mistakes-hosts-make": {
    peerGuides: [BLOG.checklist, BLOG.frequency],
    locationHub: HUB.claremont,
  },
};

export function getAirbnbGuideCrossLinkBundle(slug: string): AirbnbGuideCrossLinkBundle | null {
  return MATRIX[slug] ?? null;
}
