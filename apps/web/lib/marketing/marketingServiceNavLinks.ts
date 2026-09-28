import {
  REGULAR_CLEANING_PUBLIC_NAME,
  REGULAR_CLEANING_SERVICE_PATH,
} from "@/lib/services/publicServiceNames";

/** Canonical service URLs — must match `CAPE_TOWN_SERVICE_SEO` paths. */
export const MARKETING_SERVICE_NAV_LINKS = [
  { label: REGULAR_CLEANING_PUBLIC_NAME, href: REGULAR_CLEANING_SERVICE_PATH },
  { label: "Deep Cleaning", href: "/services/deep-cleaning-cape-town" },
  { label: "Move In / Out Cleaning", href: "/services/move-out-cleaning-cape-town" },
  { label: "Office Cleaning", href: "/services/office-cleaning-cape-town" },
  { label: "Airbnb Cleaning", href: "/services/airbnb-cleaning-cape-town" },
  { label: "Carpet Cleaning", href: "/services/carpet-cleaning-cape-town" },
  { label: "Window Cleaning", href: "/services/window-cleaning-cape-town" },
  { label: "All Services", href: "/services" },
] as const;

/** Footer lists the six primary services only; Window Cleaning is no longer presented as a primary service. */
export const MARKETING_FOOTER_SERVICE_LINKS = [
  { label: REGULAR_CLEANING_PUBLIC_NAME, href: REGULAR_CLEANING_SERVICE_PATH },
  { label: "Deep Cleaning", href: "/services/deep-cleaning-cape-town" },
  { label: "Move-in / Move-out", href: "/services/move-out-cleaning-cape-town" },
  { label: "Office Cleaning", href: "/services/office-cleaning-cape-town" },
  { label: "Airbnb Cleaning", href: "/services/airbnb-cleaning-cape-town" },
  { label: "Carpet Cleaning", href: "/services/carpet-cleaning-cape-town" },
] as const;
