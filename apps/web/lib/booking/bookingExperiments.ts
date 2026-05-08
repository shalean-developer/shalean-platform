"use client";

export const BOOKING_EXPERIMENT_ASSIGNMENTS_LS_KEY = "shalean_booking_ab_assignments_v2";

export type BookingExperimentKey =
  | "cleaner_step"
  | "pricing_display"
  | "cta_copy"
  | "addons_layout"
  /** Legacy Phase 8 keys still normalize for saved localStorage assignments. */
  | "cta_wording"
  | "cleaner_auto_assign_copy"
  | "trust_badges"
  | "addon_layout"
  | "pricing_presentation";

export type BookingExperimentVariant =
  | "control"
  | "variant_a"
  | "auto_only"
  | "optional_browse"
  | "plain_total"
  | "from_total"
  | "hours_total"
  | "continue"
  | "continue_schedule"
  | "see_available_times"
  | "book_your_time"
  | "collapsed"
  | "inline_chips"
  | "bottom_drawer";

export type BookingExperimentAssignments = Record<BookingExperimentKey, BookingExperimentVariant>;

const BOOKING_EXPERIMENT_KEYS: BookingExperimentKey[] = [
  "cleaner_step",
  "pricing_display",
  "cta_copy",
  "addons_layout",
  "cta_wording",
  "cleaner_auto_assign_copy",
  "trust_badges",
  "addon_layout",
  "pricing_presentation",
];

const DEFAULT_ASSIGNMENTS: BookingExperimentAssignments = {
  cleaner_step: "auto_only",
  pricing_display: "plain_total",
  cta_copy: "continue",
  addons_layout: "collapsed",
  cta_wording: "control",
  cleaner_auto_assign_copy: "control",
  trust_badges: "control",
  addon_layout: "control",
  pricing_presentation: "control",
};

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const VARIANTS_BY_KEY: Record<BookingExperimentKey, BookingExperimentVariant[]> = {
  cleaner_step: ["auto_only", "optional_browse"],
  pricing_display: ["plain_total", "from_total", "hours_total"],
  cta_copy: ["continue", "continue_schedule", "see_available_times", "book_your_time"],
  addons_layout: ["collapsed", "inline_chips", "bottom_drawer"],
  cta_wording: ["control", "variant_a"],
  cleaner_auto_assign_copy: ["control", "variant_a"],
  trust_badges: ["control", "variant_a"],
  addon_layout: ["control", "variant_a"],
  pricing_presentation: ["control", "variant_a"],
};

function isVariantForKey(key: BookingExperimentKey, value: unknown): value is BookingExperimentVariant {
  return typeof value === "string" && VARIANTS_BY_KEY[key].includes(value as BookingExperimentVariant);
}

function normalizeAssignments(raw: unknown): BookingExperimentAssignments | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Partial<Record<BookingExperimentKey, unknown>>;
  const next: BookingExperimentAssignments = { ...DEFAULT_ASSIGNMENTS };
  for (const key of BOOKING_EXPERIMENT_KEYS) {
    next[key] = isVariantForKey(key, record[key]) ? record[key] : DEFAULT_ASSIGNMENTS[key];
  }
  if (!isVariantForKey("cleaner_step", record.cleaner_step)) {
    next.cleaner_step = record.cleaner_auto_assign_copy === "variant_a" ? "optional_browse" : "auto_only";
  }
  if (!isVariantForKey("pricing_display", record.pricing_display)) {
    next.pricing_display = record.pricing_presentation === "variant_a" ? "from_total" : "plain_total";
  }
  if (!isVariantForKey("cta_copy", record.cta_copy)) {
    next.cta_copy = record.cta_wording === "variant_a" ? "see_available_times" : "continue";
  }
  if (!isVariantForKey("addons_layout", record.addons_layout)) {
    next.addons_layout = record.addon_layout === "variant_a" ? "inline_chips" : "collapsed";
  }
  return next;
}

function assignForSeed(seed: string): BookingExperimentAssignments {
  const next: BookingExperimentAssignments = { ...DEFAULT_ASSIGNMENTS };
  for (const key of BOOKING_EXPERIMENT_KEYS) {
    const variants = VARIANTS_BY_KEY[key];
    next[key] = variants[hashString(`${seed}:${key}`) % variants.length]!;
  }
  return next;
}

export function getBookingExperimentAssignments(seed = ""): BookingExperimentAssignments {
  if (typeof window === "undefined") return DEFAULT_ASSIGNMENTS;
  try {
    const saved = window.localStorage.getItem(BOOKING_EXPERIMENT_ASSIGNMENTS_LS_KEY);
    if (saved) {
      const parsed = normalizeAssignments(JSON.parse(saved));
      if (parsed) return parsed;
    }
    const fallbackSeed = seed || window.localStorage.getItem("shalean_booking_funnel_session_id") || "anonymous";
    const assigned = assignForSeed(fallbackSeed);
    window.localStorage.setItem(BOOKING_EXPERIMENT_ASSIGNMENTS_LS_KEY, JSON.stringify(assigned));
    return assigned;
  } catch {
    return assignForSeed(seed || "anonymous");
  }
}

export function bookingExperimentLabel(assignments: BookingExperimentAssignments): string {
  return BOOKING_EXPERIMENT_KEYS.map((key) => `${key}:${assignments[key]}`).join("|");
}

