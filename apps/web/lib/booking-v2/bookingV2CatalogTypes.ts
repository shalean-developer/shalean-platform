import type { CleanerMode, FieldType, ServiceSlug } from "@/src/features/booking-v2/config/serviceConfig";

export type BookingV2FormQuestion = {
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

export type BookingV2ExtraTypeFilter = "light" | "heavy" | "all";

export type BookingV2ServiceDefinition = {
  slug: ServiceSlug;
  pricingSlug: string;
  label: string;
  shortLabel: string;
  description: string;
  cleanerMode: CleanerMode;
  extraTypes: BookingV2ExtraTypeFilter[];
  /** Optional allowlist of pricing_extras slugs; when set, only these extras are shown. */
  extraSlugs?: string[];
  /** When true, show equipment delivery question (regular cleaning only). */
  showEquipmentQuestion: boolean;
  /** @deprecated use showEquipmentQuestion */
  showCleaningProductsQuestion?: boolean;
  allowsExtraCleaner: boolean;
  step1Questions: BookingV2FormQuestion[];
  isActive?: boolean;
  sortOrder?: number;
};

export type BookingV2SchedulingConfig = {
  leadMinutes: number;
  slotStartHour: number;
  slotEndHour: number;
  slotIntervalMinutes: number;
  timezone: string;
};

export type BookingV2CatalogConfig = {
  services: BookingV2ServiceDefinition[];
  scheduling?: Partial<BookingV2SchedulingConfig>;
};

export type LiveExtra = {
  id: string;
  label: string;
  description: string;
  priceZar: number;
  isPopular: boolean;
};

export type LiveServiceConfig = {
  slug: ServiceSlug;
  label: string;
  shortLabel: string;
  description: string;
  cleanerMode: CleanerMode;
  /** When true, show equipment delivery question (regular cleaning only). */
  showEquipmentQuestion: boolean;
  /** @deprecated use showEquipmentQuestion */
  showCleaningProductsQuestion?: boolean;
  allowsExtraCleaner: boolean;
  step1Questions: BookingV2FormQuestion[];
  basePrice: number;
  pricePerBedroom: number;
  pricePerBathroom: number;
  pricePerExtraRoom: number;
  pricePerExtraCleaner: number;
  estimatedDurationHours: number;
  /** Admin-configured duration clamp from `pricing_services`. */
  minDurationHours: number;
  maxDurationHours: number;
  extras: LiveExtra[];
};

export type ServicesCatalog = Record<ServiceSlug, LiveServiceConfig>;

export type BookingV2CatalogPayload = {
  catalog: ServicesCatalog;
  feesConfig: import("@/lib/booking-v2/types").BookingV2FeesConfig;
  scheduling: BookingV2SchedulingConfig;
  activeServiceSlugs: ServiceSlug[];
};
