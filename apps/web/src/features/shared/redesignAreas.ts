export type RedesignAreaId = "book" | "account" | "jobs" | "office";

export type RedesignAreaMeta = {
  id: RedesignAreaId;
  title: string;
  description: string;
  route: string;
  legacyRoute: string;
  legacyLabel: string;
};

export const REDESIGN_AREAS: Record<RedesignAreaId, RedesignAreaMeta> = {
  book: {
    id: "book",
    title: "Book a clean",
    description: "Authenticated booking flow — service, property, schedule, cleaner, and summary.",
    route: "/book",
    legacyRoute: "/booking",
    legacyLabel: "Current booking flow (/booking)",
  },
  account: {
    id: "account",
    title: "Customer dashboard",
    description: "New customer home — bookings, billing, and profile will live here.",
    route: "/account",
    legacyRoute: "/dashboard",
    legacyLabel: "Current customer dashboard (/dashboard)",
  },
  jobs: {
    id: "jobs",
    title: "Cleaner jobs",
    description: "New cleaner workspace — offers, schedule, and earnings will live here.",
    route: "/jobs",
    legacyRoute: "/cleaner",
    legacyLabel: "Current cleaner app (/cleaner)",
  },
  office: {
    id: "office",
    title: "Operations office",
    description: "New admin workspace — bookings, dispatch, and payouts will live here.",
    route: "/office",
    legacyRoute: "/admin",
    legacyLabel: "Current admin console (/admin)",
  },
};
