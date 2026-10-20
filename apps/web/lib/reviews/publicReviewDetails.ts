import { REGULAR_CLEANING_PUBLIC_NAME, REGULAR_CLEANING_SERVICE_PATH } from "@/lib/services/publicServiceNames";

export type ReviewDetailChoices = { name: boolean; area: boolean; service: boolean };
export type ReviewPublicationContext = { display_name: string | null; suburb_label: string | null; service_key: string | null };
const SERVICES: Record<string, { title: string; href: string }> = {
  standard: { title: REGULAR_CLEANING_PUBLIC_NAME, href: REGULAR_CLEANING_SERVICE_PATH },
  deep: { title: "Deep Cleaning", href: "/services/deep-cleaning-cape-town" },
  move: { title: "Move In / Out Cleaning", href: "/services/move-out-cleaning-cape-town" },
  airbnb: { title: "Airbnb Cleaning", href: "/services/airbnb-cleaning-cape-town" },
  office: { title: "Office Cleaning", href: "/services/office-cleaning-cape-town" },
  carpet: { title: "Carpet Cleaning", href: "/services/carpet-cleaning-cape-town" },
};
export function reviewServicePresentation(key: string | null | undefined) {
  return key && Object.hasOwn(SERVICES, key) ? SERVICES[key] : null;
}
export function isReviewDetailChoices(value: unknown): value is ReviewDetailChoices {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return [v.name, v.area, v.service].every((choice) => typeof choice === "boolean");
}
