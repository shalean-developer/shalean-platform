import {
  Home,
  Droplets,
  Truck,
  Building2,
  Layers,
  CalendarCheck,
  type LucideIcon,
} from "lucide-react";

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
    options: [
      { value: "1", label: "1 bedroom" },
      { value: "2", label: "2 bedrooms" },
      { value: "3", label: "3 bedrooms" },
      { value: "4", label: "4 bedrooms" },
      { value: "5", label: "5+ bedrooms" },
    ],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "1", label: "1 bathroom" },
      { value: "2", label: "2 bathrooms" },
      { value: "3", label: "3 bathrooms" },
      { value: "4", label: "4+ bathrooms" },
    ],
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
  { id: "inside_cabinets",  label: "Inside Cabinets",  description: "Clean inside all kitchen & bathroom cabinets", priceZar: 180 },
  { id: "inside_oven",      label: "Inside Oven",       description: "Deep clean inside the oven",                  priceZar: 200 },
  { id: "inside_fridge",    label: "Inside Fridge",     description: "Interior fridge clean",                       priceZar: 150 },
  { id: "interior_walls",   label: "Interior Walls",    description: "Wipe down all interior walls",                priceZar: 150 },
  { id: "ironing_laundry",  label: "Ironing & Laundry", description: "Wash and iron up to 2 loads",                 priceZar: 250 },
  { id: "interior_windows", label: "Interior Windows",  description: "Clean all interior windows",                  priceZar: 180 },
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
    options: [
      { value: "1", label: "1 bedroom" },
      { value: "2", label: "2 bedrooms" },
      { value: "3", label: "3 bedrooms" },
      { value: "4", label: "4 bedrooms" },
      { value: "5", label: "5+ bedrooms" },
    ],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "1", label: "1 bathroom" },
      { value: "2", label: "2 bathrooms" },
      { value: "3", label: "3 bathrooms" },
      { value: "4", label: "4+ bathrooms" },
    ],
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
  { id: "balcony",         label: "Balcony Cleaning",  description: "Sweep and wash balcony or patio area", priceZar: 200 },
  { id: "carpet_clean",    label: "Carpet Cleaning",   description: "Steam clean all carpets",              priceZar: 400 },
  { id: "ceiling_clean",   label: "Ceiling Cleaning",  description: "Wipe down ceilings and cornices",      priceZar: 220 },
  { id: "garage_clean",    label: "Garage Cleaning",   description: "Sweep and clean the garage",           priceZar: 200 },
  { id: "mattress_clean",  label: "Mattress Cleaning", description: "Clean and sanitise one mattress",      priceZar: 250 },
  { id: "outside_windows", label: "Outside Windows",   description: "Clean all exterior windows",           priceZar: 300 },
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
    label: "Move type",
    type: "radio",
    required: true,
    centered: true,
    options: [
      { value: "move_out", label: "Moving out (end of tenancy)" },
      { value: "move_in", label: "Moving in (new property)" },
      { value: "both", label: "Both move-out and move-in" },
    ],
  },
  {
    key: "bedrooms",
    label: "Number of bedrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "1", label: "1 bedroom" },
      { value: "2", label: "2 bedrooms" },
      { value: "3", label: "3 bedrooms" },
      { value: "4", label: "4 bedrooms" },
      { value: "5", label: "5+ bedrooms" },
    ],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "1", label: "1 bathroom" },
      { value: "2", label: "2 bathrooms" },
      { value: "3", label: "3 bathrooms" },
      { value: "4", label: "4+ bathrooms" },
    ],
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
    label: "Is the property furnished?",
    type: "radio",
    required: true,
    group: "yesno",
    centered: true,
    options: [
      { value: "yes", label: "Yes" },
      { value: "no", label: "No — empty property" },
    ],
    hint: "Empty properties are often faster to clean.",
  },
  {
    key: "depositInspection",
    label: "Is this for a deposit inspection?",
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
    placeholder: "Landlord requirements, key handover details...",
  },
];

const MOVING_EXTRAS: ServiceExtra[] = [
  { id: "balcony",         label: "Balcony Cleaning",  description: "Sweep and wash balcony or patio area", priceZar: 200 },
  { id: "carpet_clean",    label: "Carpet Cleaning",   description: "Steam clean all carpets",              priceZar: 400 },
  { id: "ceiling_clean",   label: "Ceiling Cleaning",  description: "Wipe down ceilings and cornices",      priceZar: 220 },
  { id: "garage_clean",    label: "Garage Cleaning",   description: "Sweep and clean the garage",           priceZar: 200 },
  { id: "mattress_clean",  label: "Mattress Cleaning", description: "Clean and sanitise one mattress",      priceZar: 250 },
  { id: "outside_windows", label: "Outside Windows",   description: "Clean all exterior windows",           priceZar: 300 },
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
    options: [
      { value: "1", label: "1" },
      { value: "2", label: "2" },
      { value: "3", label: "3" },
      { value: "4", label: "4+" },
    ],
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
  { id: "kitchen", label: "Kitchen / break room", description: "Deep clean appliances and surfaces", priceZar: 200 },
  { id: "windows", label: "Interior windows", description: "Clean all office windows", priceZar: 250 },
  { id: "carpet_vacuum", label: "Deep carpet vacuum", description: "High-powered carpet clean", priceZar: 300 },
  { id: "sanitize", label: "Sanitisation service", description: "Full surface sanitisation spray", priceZar: 180 },
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
  { id: "stain_treatment", label: "Stain treatment", description: "Professional stain removal", priceZar: 200 },
  { id: "odour_treatment", label: "Pet odour treatment", description: "Enzyme-based odour neutraliser", priceZar: 180 },
  { id: "fabric_protection", label: "Fabric protector", description: "Scotchgard-style protection spray", priceZar: 220 },
  { id: "mattress", label: "Mattress cleaning", description: "Clean and sanitise one mattress", priceZar: 250 },
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
    options: [
      { value: "1", label: "1 bedroom" },
      { value: "2", label: "2 bedrooms" },
      { value: "3", label: "3 bedrooms" },
      { value: "4", label: "4 bedrooms" },
      { value: "5", label: "5+ bedrooms" },
    ],
  },
  {
    key: "bathrooms",
    label: "Number of bathrooms",
    type: "select",
    required: true,
    group: "rooms",
    options: [
      { value: "1", label: "1 bathroom" },
      { value: "2", label: "2 bathrooms" },
      { value: "3", label: "3 bathrooms" },
      { value: "4", label: "4+ bathrooms" },
    ],
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
  { id: "laundry", label: "Laundry & linen wash", description: "Wash, dry and fold linens", priceZar: 250 },
  { id: "oven", label: "Oven clean", description: "Deep clean inside the oven", priceZar: 200 },
  { id: "welcome_setup", label: "Welcome setup", description: "Arrange towels, toiletries, staging", priceZar: 150 },
  { id: "windows_interior", label: "Interior windows", description: "Clean all interior windows", priceZar: 180 },
  { id: "inspection_photos", label: "Post-clean photos", description: "Timestamped photos for your records", priceZar: 100 },
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

export { MAX_TEAM_BOOKINGS_PER_DAY } from "@/lib/dispatch/teamJobsPerDay";
