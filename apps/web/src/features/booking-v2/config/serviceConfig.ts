import {
  Home,
  Droplets,
  Truck,
  Building2,
  Layers,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";
import {
  BATHROOM_COUNT_OPTIONS,
  BEDROOM_COUNT_OPTIONS,
} from "@/src/features/booking-v2/config/roomCountOptions";

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

export type FieldType = "select" | "number" | "radio" | "checkbox" | "text" | "textarea";

export type FormQuestion = {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
  group?: string;
  centered?: boolean;
  /** When set, question is shown only if `serviceDetails[key]` is one of `values`. */
  showWhen?: { key: string; values: string[] };
};

export type ServiceExtra = {
  id: string;
  label: string;
  description: string;
  priceZar: number;
};

export type PricingTier = {
  label: string;
  priceZar: number;
};

export type ServiceConfig = {
  slug: ServiceSlug;
  label: string;
  shortLabel: string;
  description: string;
  icon: LucideIcon;
  cleanerMode: CleanerMode;
  basePrice: number;
  pricePerExtraCleaner: number;
  estimatedDurationHours: number;
  step1Questions: FormQuestion[];
  extras: ServiceExtra[];
};

// ─── Regular Cleaning ──────────────────────────────────────────────────────────

const REGULAR_QUESTIONS: FormQuestion[] = [
  {
    key: "propertyType",
    label: "Property type",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "house", label: "House" },
      { value: "apartment", label: "Apartment / flat" },
      { value: "townhouse", label: "Townhouse" },
    ],
  },
  {
    key: "bedrooms",
    label: "Number of bedrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BEDROOM_COUNT_OPTIONS],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BATHROOM_COUNT_OPTIONS],
  },
  {
    key: "extraRooms",
    label: "Number of extra rooms",
    type: "select",
    required: false,
    group: "rooms",
    options: [
      { value: "0", label: "No extra rooms" },
      { value: "1", label: "1 extra room" },
      { value: "2", label: "2 extra rooms" },
      { value: "3", label: "3+ extra rooms" },
    ],
  },
  {
    key: "hasPets",
    label: "Do you have any pets?",
    type: "radio",
    required: true,
    group: "yesno",
    centered: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "specialInstructions",
    label: "Special instructions (optional)",
    type: "textarea",
    placeholder: "e.g. focus on kitchen, avoid the study...",
  },
];

const REGULAR_EXTRAS: ServiceExtra[] = [
  { id: "inside-fridge", label: "Inside Fridge", description: "Interior fridge clean", priceZar: 150 },
  { id: "inside-oven", label: "Inside Oven", description: "Deep clean inside the oven", priceZar: 200 },
  { id: "laundry", label: "Laundry", description: "Wash and hang up to 1 load", priceZar: 150 },
  { id: "ironing", label: "Ironing", description: "Ironing up to 1 load", priceZar: 150 },
  { id: "interior-windows", label: "Windows", description: "Clean all interior windows", priceZar: 180 },
];

// ─── Deep Cleaning ─────────────────────────────────────────────────────────────

const DEEP_QUESTIONS: FormQuestion[] = [
  {
    key: "propertyType",
    label: "Property type",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "house", label: "House" },
      { value: "apartment", label: "Apartment / flat" },
      { value: "townhouse", label: "Townhouse" },
    ],
  },
  {
    key: "bedrooms",
    label: "Number of bedrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BEDROOM_COUNT_OPTIONS],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BATHROOM_COUNT_OPTIONS],
  },
  {
    key: "extraRooms",
    label: "Number of extra rooms",
    type: "select",
    required: false,
    group: "rooms",
    options: [
      { value: "0", label: "No extra rooms" },
      { value: "1", label: "1 extra room" },
      { value: "2", label: "2 extra rooms" },
      { value: "3", label: "3+ extra rooms" },
    ],
  },
  {
    key: "lastCleaned",
    label: "When was it last professionally cleaned?",
    type: "select",
    required: true,
    options: [
      { value: "never", label: "Never / unsure" },
      { value: "6_months_plus", label: "6+ months ago" },
      { value: "3_6_months", label: "3–6 months ago" },
      { value: "1_3_months", label: "1–3 months ago" },
    ],
    hint: "Helps us estimate the time required.",
  },
  {
    key: "hasPets",
    label: "Do you have any pets?",
    type: "radio",
    required: true,
    group: "yesno",
    centered: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "specialInstructions",
    label: "Special instructions (optional)",
    type: "textarea",
    placeholder: "Any areas to focus on or avoid...",
  },
];

const DEEP_EXTRAS: ServiceExtra[] = [
  { id: "inside-cabinets", label: "Cupboards", description: "Clean inside kitchen and bathroom cupboards", priceZar: 180 },
  { id: "inside-wardrobes", label: "Wardrobes", description: "Clean inside wardrobes and shelving", priceZar: 180 },
  { id: "blinds-cleaning", label: "Blinds", description: "Dust and wipe blinds", priceZar: 200 },
  { id: "interior-walls", label: "Walls", description: "Wipe down interior walls", priceZar: 150 },
];

// ─── Moving Cleaning ───────────────────────────────────────────────────────────

const MOVING_QUESTIONS: FormQuestion[] = [
  {
    key: "propertyType",
    label: "Property type",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "house", label: "House" },
      { value: "apartment", label: "Apartment / flat" },
      { value: "townhouse", label: "Townhouse" },
    ],
  },
  {
    key: "moveType",
    label: "Is this a move-in or move-out clean?",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "move_out", label: "Move-out" },
      { value: "move_in", label: "Move-in" },
    ],
    hint: "Choose one — we’ll tailor questions for that clean.",
  },
  {
    key: "bedrooms",
    label: "Number of bedrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BEDROOM_COUNT_OPTIONS],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BATHROOM_COUNT_OPTIONS],
  },
  {
    key: "extraRooms",
    label: "Number of extra rooms",
    type: "select",
    required: false,
    group: "rooms",
    options: [
      { value: "0", label: "No extra rooms" },
      { value: "1", label: "1 extra room" },
      { value: "2", label: "2 extra rooms" },
      { value: "3", label: "3+ extra rooms" },
    ],
  },
  {
    key: "furnished",
    label: "Is the property furnished or empty?",
    type: "radio",
    required: true,
    group: "yesno",
    centered: true,
    showWhen: { key: "moveType", values: ["move_out", "both"] },
    options: [
      { value: "yes", label: "Furnished — furniture still inside" },
      { value: "no", label: "Empty — cleared for handover" },
    ],
    hint: "Empty homes are usually quicker; furnished homes need more care around belongings.",
  },
  {
    key: "depositInspection",
    label: "Is this for a final rental / deposit inspection?",
    type: "radio",
    required: true,
    group: "yesno",
    centered: true,
    showWhen: { key: "moveType", values: ["move_out", "both"] },
    options: [
      { value: "yes", label: "Yes — landlord or agency inspection" },
      { value: "no", label: "No — general move-out clean" },
    ],
    hint: "We’ll prioritise skirting, cupboards, and other inspection hotspots when yes.",
  },
  {
    key: "specialInstructions",
    label: "Special instructions (optional)",
    type: "textarea",
    placeholder: "Landlord requirements, key handover details...",
  },
];

const MOVING_EXTRAS: ServiceExtra[] = [
  { id: "deposit-preparation", label: "Deposit preparation", description: "Extra detail for rental deposit / inspection readiness", priceZar: 250 },
  { id: "appliances-cleaning", label: "Appliances", description: "Clean major kitchen appliances inside and out", priceZar: 220 },
  { id: "inside-cabinets", label: "Cupboards", description: "Clean inside cabinets and cupboards", priceZar: 180 },
  { id: "garage-cleaning", label: "Garage", description: "Sweep and clean the garage", priceZar: 200 },
];

// ─── Office Cleaning ───────────────────────────────────────────────────────────

const OFFICE_QUESTIONS: FormQuestion[] = [
  {
    key: "officeType",
    label: "Office type",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "open_plan", label: "Open plan" },
      { value: "private_offices", label: "Private offices" },
      { value: "coworking", label: "Co-working space" },
    ],
  },
  {
    key: "officeSize",
    label: "Office size",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "small", label: "Small (1–5 desks)" },
      { value: "medium", label: "Medium (6–20 desks)" },
      { value: "large", label: "Large (21–50 desks)" },
      { value: "enterprise", label: "Enterprise (50+ desks)" },
    ],
  },
  {
    key: "bathrooms",
    label: "Bathrooms / kitchenettes",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BATHROOM_COUNT_OPTIONS],
  },
  {
    key: "frequency",
    label: "Cleaning frequency",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "daily", label: "Daily (Mon–Fri)" },
      { value: "twice_week", label: "Twice a week" },
      { value: "weekly", label: "Weekly" },
      { value: "once_off", label: "Once-off" },
    ],
  },
  {
    key: "afterHours",
    label: "Preferred cleaning time",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "during_hours", label: "During office hours" },
      { value: "after_hours", label: "After hours / evenings" },
      { value: "weekends", label: "Weekends only" },
    ],
  },
  {
    key: "specialInstructions",
    label: "Special instructions (optional)",
    type: "textarea",
    placeholder: "Access code, areas to avoid, IT equipment notes...",
  },
];

const OFFICE_EXTRAS: ServiceExtra[] = [
  { id: "office-kitchen", label: "Kitchen", description: "Clean shared office kitchenette", priceZar: 200 },
  { id: "office-sanitisation", label: "Sanitisation", description: "High-touch sanitisation of desks and common areas", priceZar: 250 },
  { id: "waste-removal", label: "Waste Removal", description: "Remove bagged office waste", priceZar: 180 },
];

// ─── Carpet Cleaning ───────────────────────────────────────────────────────────

const CARPET_QUESTIONS: FormQuestion[] = [
  {
    key: "propertyType",
    label: "Property type",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "house", label: "House" },
      { value: "apartment", label: "Apartment / flat" },
      { value: "townhouse", label: "Townhouse" },
    ],
  },
  {
    key: "carpetRooms",
    label: "Number of carpeted rooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "1", label: "1 room" },
      { value: "2", label: "2 rooms" },
      { value: "3", label: "3 rooms" },
      { value: "4", label: "4 rooms" },
      { value: "5", label: "5+ rooms" },
    ],
  },
  {
    key: "carpetType",
    label: "Carpet type",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "standard", label: "Standard pile" },
      { value: "thick_pile", label: "Thick / shag pile" },
      { value: "berber", label: "Berber / loop" },
      { value: "persian_rug", label: "Persian / area rug" },
    ],
  },
  {
    key: "sofaCount",
    label: "Number of sofas to clean",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "0", label: "No sofas" },
      { value: "1", label: "1 sofa" },
      { value: "2", label: "2 sofas" },
      { value: "3", label: "3+ sofas" },
    ],
  },
  {
    key: "stains",
    label: "Are there visible stains?",
    type: "radio",
    required: true,
    group: "yesno",
    centered: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "hasPets",
    label: "Do you have any pets?",
    type: "radio",
    required: true,
    group: "yesno",
    centered: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "specialInstructions",
    label: "Special instructions (optional)",
    type: "textarea",
    placeholder: "Problem areas, delicate rugs, stain details...",
  },
];

const CARPET_EXTRAS: ServiceExtra[] = [
  { id: "stain-treatment", label: "Stain treatment", description: "Professional stain removal", priceZar: 200 },
  { id: "pet-odour-treatment", label: "Pet odour treatment", description: "Enzyme-based odour neutraliser", priceZar: 220 },
  { id: "fabric-protector", label: "Fabric protector", description: "Scotchgard-style protection spray", priceZar: 180 },
  { id: "mattress-cleaning", label: "Mattress cleaning", description: "Clean and sanitise one mattress", priceZar: 250 },
];

// ─── Airbnb Cleaning ───────────────────────────────────────────────────────────

const AIRBNB_QUESTIONS: FormQuestion[] = [
  {
    key: "propertyType",
    label: "Property type",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "house", label: "House" },
      { value: "apartment", label: "Apartment / flat" },
      { value: "townhouse", label: "Townhouse" },
    ],
  },
  {
    key: "bedrooms",
    label: "Number of bedrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BEDROOM_COUNT_OPTIONS],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [...BATHROOM_COUNT_OPTIONS],
  },
  {
    key: "extraRooms",
    label: "Number of extra rooms",
    type: "select",
    required: false,
    group: "rooms",
    options: [
      { value: "0", label: "No extra rooms" },
      { value: "1", label: "1 extra room" },
      { value: "2", label: "2 extra rooms" },
      { value: "3", label: "3+ extra rooms" },
    ],
  },
  {
    key: "linens",
    label: "Linen service",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "change", label: "Change and make beds" },
      { value: "no_change", label: "No linen change needed" },
    ],
  },
  {
    key: "guestCheckout",
    label: "Guest checkout time",
    type: "select",
    required: true,
    group: "logistics",
    options: [
      { value: "10am", label: "By 10:00 AM" },
      { value: "11am", label: "By 11:00 AM" },
      { value: "12pm", label: "By 12:00 PM" },
      { value: "flexible", label: "Flexible" },
    ],
  },
  {
    key: "keyAccess",
    label: "Key / access method",
    type: "select",
    required: true,
    group: "logistics",
    options: [
      { value: "lockbox", label: "Lockbox" },
      { value: "smart_lock", label: "Smart lock / code" },
      { value: "in_person", label: "Meet in person" },
      { value: "managed", label: "Managed by agent" },
    ],
  },
  {
    key: "welcomeBasket",
    label: "Restock welcome essentials?",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "yes", label: "Yes — I'll leave supplies" },
      { value: "no", label: "No" },
    ],
  },
  {
    key: "specialInstructions",
    label: "Special host instructions (optional)",
    type: "textarea",
    placeholder: "Staging preferences, check-in checklist, fragile items...",
  },
];

const AIRBNB_EXTRAS: ServiceExtra[] = [
  { id: "laundry", label: "Laundry", description: "Wash, dry and fold linens", priceZar: 250 },
  { id: "inside-oven", label: "Inside Oven", description: "Deep clean inside the oven", priceZar: 200 },
  { id: "welcome-setup", label: "Welcome setup", description: "Arrange towels, toiletries, staging", priceZar: 150 },
  { id: "interior-windows", label: "Interior windows", description: "Clean all interior windows", priceZar: 180 },
  { id: "inspection-photos", label: "Post-clean photos", description: "Timestamped photos for your records", priceZar: 100 },
];

// ─── Master Config Map ──────────────────────────────────────────────────────────

export const SERVICE_CONFIG: Record<ServiceSlug, ServiceConfig> = {
  "regular-cleaning": {
    slug: "regular-cleaning",
    label: "Regular Cleaning",
    shortLabel: "Regular",
    description: "Keep your home fresh and comfortable with a reliable weekly or once-off clean.",
    icon: Home,
    cleanerMode: "individual_cleaners",
    basePrice: 350,
    pricePerExtraCleaner: 200,
    estimatedDurationHours: 3,
    step1Questions: REGULAR_QUESTIONS,
    extras: REGULAR_EXTRAS,
  },
  "deep-cleaning": {
    slug: "deep-cleaning",
    label: "Deep Cleaning",
    shortLabel: "Deep Clean",
    description: "A thorough top-to-bottom clean of every surface, corner, and room.",
    icon: Droplets,
    cleanerMode: "team",
    basePrice: 950,
    pricePerExtraCleaner: 0,
    estimatedDurationHours: 6,
    step1Questions: DEEP_QUESTIONS,
    extras: DEEP_EXTRAS,
  },
  "moving-cleaning": {
    slug: "moving-cleaning",
    label: "Moving Cleaning",
    shortLabel: "Move In/Out",
    description: "Move-in or move-out clean to ensure a smooth handover and full deposit return.",
    icon: Truck,
    cleanerMode: "team",
    basePrice: 1100,
    pricePerExtraCleaner: 0,
    estimatedDurationHours: 7,
    step1Questions: MOVING_QUESTIONS,
    extras: MOVING_EXTRAS,
  },
  "office-cleaning": {
    slug: "office-cleaning",
    label: "Office Cleaning",
    shortLabel: "Office",
    description: "Professional cleaning for offices and workspaces to keep your team productive.",
    icon: Building2,
    cleanerMode: "individual_cleaners",
    basePrice: 450,
    pricePerExtraCleaner: 220,
    estimatedDurationHours: 3,
    step1Questions: OFFICE_QUESTIONS,
    extras: OFFICE_EXTRAS,
  },
  "carpet-cleaning": {
    slug: "carpet-cleaning",
    label: "Carpet Cleaning",
    shortLabel: "Carpets",
    description: "Steam and shampoo carpets, rugs and upholstery to remove stains and odours.",
    icon: Layers,
    cleanerMode: "individual_cleaners",
    basePrice: 500,
    pricePerExtraCleaner: 200,
    estimatedDurationHours: 4,
    step1Questions: CARPET_QUESTIONS,
    extras: CARPET_EXTRAS,
  },
  "airbnb-cleaning": {
    slug: "airbnb-cleaning",
    label: "Airbnb Cleaning",
    shortLabel: "Airbnb",
    description: "Fast, reliable turnovers that keep your listing sparkling and guests happy.",
    icon: CalendarCheck,
    cleanerMode: "individual_cleaners",
    basePrice: 400,
    pricePerExtraCleaner: 200,
    estimatedDurationHours: 3,
    step1Questions: AIRBNB_QUESTIONS,
    extras: AIRBNB_EXTRAS,
  },
};

export function getServiceConfig(slug: string): ServiceConfig | null {
  return SERVICE_CONFIG[slug as ServiceSlug] ?? null;
}

export function isValidServiceSlug(slug: string): slug is ServiceSlug {
  return SERVICE_SLUGS.includes(slug as ServiceSlug);
}

export const TEAM_SERVICES: ServiceSlug[] = ["deep-cleaning", "moving-cleaning"];

/** Equipment delivery question — regular cleaning only (deep/move include supplies). */
export function serviceShowsEquipmentQuestion(slug: ServiceSlug): boolean {
  return slug === "regular-cleaning";
}

/** @deprecated use serviceShowsEquipmentQuestion */
export function serviceShowsCleaningProductsQuestion(slug: ServiceSlug): boolean {
  return serviceShowsEquipmentQuestion(slug);
}

export const TEAMS = [
  { id: "team-1", name: "Team 1" },
  { id: "team-2", name: "Team 2" },
  { id: "team-3", name: "Team 3" },
] as const;

/** @deprecated Booking flows load teams from `public.teams` via `/api/booking-v2/team-availability`. */

export { MAX_TEAM_BOOKINGS_PER_DAY } from "@/lib/dispatch/teamJobsPerDay";
