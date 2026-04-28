/** One preferred working window; `day` is 0–6 (Sunday–Saturday, UTC calendar date). */
export type PreferredTimeBlock = {
  day: number;
  start: string;
  end: string;
};

export type CleanerPreferencesPayload = {
  preferred_areas: string[];
  preferred_services: string[];
  preferred_time_blocks: PreferredTimeBlock[];
  is_strict: boolean;
};

/** Service slugs aligned with `bookings.service_slug` / booking flow. */
export const ADMIN_DISPATCH_SERVICE_SLUGS = [
  "quick",
  "standard",
  "airbnb",
  "deep",
  "carpet",
  "move",
] as const;

export type AdminDispatchServiceSlug = (typeof ADMIN_DISPATCH_SERVICE_SLUGS)[number];

export const ADMIN_DISPATCH_SERVICE_LABELS: Record<AdminDispatchServiceSlug, string> = {
  quick: "Quick",
  standard: "Standard",
  airbnb: "Airbnb",
  deep: "Deep clean",
  carpet: "Carpet",
  move: "Move-out / move-in",
};

export const WEEKDAY_OPTIONS: { value: number; label: string }[] = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
];
