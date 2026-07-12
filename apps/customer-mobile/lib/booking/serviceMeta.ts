export const SERVICE_SLUGS = [
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "office-cleaning",
  "carpet-cleaning",
  "airbnb-cleaning",
] as const;

export type ServiceSlug = (typeof SERVICE_SLUGS)[number];

export type CleanerMode = "team" | "individual_cleaners";

/** Services that always use a team assignment. */
export const TEAM_ONLY_SLUGS = new Set<ServiceSlug>(["deep-cleaning", "moving-cleaning"]);

/** Services that charge extra cleaner cost (individual mode only). */
export const EXTRA_CLEANER_SERVICE_SLUGS = new Set<ServiceSlug>([
  "regular-cleaning",
  "airbnb-cleaning",
  "office-cleaning",
  "carpet-cleaning",
]);

const ROOM_BASED = new Set<ServiceSlug>([
  "regular-cleaning",
  "deep-cleaning",
  "moving-cleaning",
  "airbnb-cleaning",
]);

export function isRoomBasedService(slug: ServiceSlug): boolean {
  return ROOM_BASED.has(slug);
}

export function isServiceSlug(value: string): value is ServiceSlug {
  return (SERVICE_SLUGS as readonly string[]).includes(value);
}

export function defaultCleanerMode(slug: ServiceSlug): CleanerMode {
  return TEAM_ONLY_SLUGS.has(slug) ? "team" : "individual_cleaners";
}

export const SERVICE_LABELS: Record<ServiceSlug, string> = {
  "regular-cleaning": "Regular Cleaning",
  "deep-cleaning": "Deep Cleaning",
  "moving-cleaning": "Moving Cleaning",
  "office-cleaning": "Office Cleaning",
  "carpet-cleaning": "Carpet Cleaning",
  "airbnb-cleaning": "Airbnb Cleaning",
};

export const BOOKING_STEP_LABELS = ["Details", "Schedule", "Review", "Checkout"] as const;
