import type { CleanerMode, ServiceSlug } from "@/lib/booking/serviceMeta";

export type BookingV2FormQuestion = {
  key: string;
  label: string;
  type: "select" | "number" | "radio" | "checkbox" | "text" | "textarea";
  required?: boolean;
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  placeholder?: string;
  hint?: string;
  group?: string;
  centered?: boolean;
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
  showEquipmentQuestion: boolean;
  showCleaningProductsQuestion?: boolean;
  allowsExtraCleaner: boolean;
  step1Questions: BookingV2FormQuestion[];
  basePrice: number;
  pricePerBedroom: number;
  pricePerBathroom: number;
  pricePerExtraRoom: number;
  pricePerExtraCleaner: number;
  estimatedDurationHours: number;
  minDurationHours: number;
  maxDurationHours: number;
  extras: LiveExtra[];
};

export type BookingV2SchedulingConfig = {
  leadMinutes: number;
  slotStartHour: number;
  slotEndHour: number;
  slotIntervalMinutes: number;
  timezone: string;
};

export type RecurringDiscountRule = {
  type: "percent" | "fixed";
  value: number;
};

export type PropertyFactorRatesConfig = {
  propertyType?: Record<string, number>;
  officeSize?: Record<string, number>;
  lastCleaned?: Record<string, number>;
  furnished?: Record<string, number>;
  carpetType?: Record<string, number>;
  stains?: Record<string, number>;
  carpetRooms_per_room_zar?: number;
};

export type BookingV2FeesConfig = {
  suppliesEquipmentFeeZar: number;
  extraCleanerFeeZar: number;
  serviceFeeRule: "flat" | "percent" | "percent_floor" | "optimized" | "none";
  serviceFeeFlatCents: number;
  serviceFeePercent: number;
  recurringDiscounts: Record<string, RecurringDiscountRule>;
  propertyFactorRates: PropertyFactorRatesConfig;
  suppliesEquipmentCostZar: number;
};

export type ServicesCatalog = Partial<Record<ServiceSlug, LiveServiceConfig>>;

export type BookingV2CatalogPayload = {
  catalog: ServicesCatalog;
  feesConfig: BookingV2FeesConfig;
  scheduling: BookingV2SchedulingConfig;
  activeServiceSlugs: ServiceSlug[];
};

export type EquipmentQuoteResult = {
  distance_km: number;
  base_fee: number;
  price_per_km: number;
  distance_charge: number;
  logistics_fee: number;
  base_location: string;
  manual_quote_required: boolean;
  manual_quote_message: string;
  geocode_error?: boolean;
  distance_source?: "geocode" | "suburb_centroid";
  customer_latitude?: number;
  customer_longitude?: number;
};

export type PricingLineItem = {
  label: string;
  amountZar: number;
};

export type SelectedExtraLine = {
  extra_id: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
};

export type CustomerPricingBreakdown = {
  base_service_price: number;
  property_factors_total: number;
  bedrooms_price: number;
  bathrooms_price: number;
  extra_rooms_price: number;
  property_size_price: number;
  selected_extras: SelectedExtraLine[];
  selected_extras_total: number;
  supplies_equipment_fee: number;
  equipment_logistics_fee: number;
  equipment_distance_km: number;
  equipment_base_fee: number;
  equipment_distance_charge: number;
  manual_quote_required: boolean;
  extra_cleaner_cost: number;
  cleaning_service_subtotal: number;
  vip_discount_zar?: number;
  vip_tier?: string;
  subtotal_before_service_fee: number;
  service_fee: number;
  recurring_discount: number;
  estimated_total: number;
  estimated_duration_minutes: number;
  lineItems: PricingLineItem[];
  basePrice: number;
  extrasTotal: number;
  cleanerSurcharge: number;
  total: number;
};

export type CleanerBadge = "recommended" | "top_rated" | "nearby" | "new";

export type AvailableCleanerV2 = {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  rating: number | null;
  jobsCompleted: number;
  areasServed: string | null;
  isAvailable: boolean;
  slotEligible: boolean;
  badges: CleanerBadge[];
  unavailableReason: string | null;
};

export type AvailableTeam = {
  id: string;
  name: string;
  available: boolean;
};

export type CleanerPublicReview = {
  id: string;
  rating: number;
  comment: string | null;
  createdAt: string;
  reviewerName: string;
};

export type CleanerPublicProfile = {
  ok?: boolean;
  cleanerId: string;
  name: string;
  rating: number | null;
  jobsCompleted: number;
  areasServed: string | null;
  isAvailable: boolean;
  availability: {
    weekdays: string[];
    weekdayLabels: string[];
    startTime: string | null;
    endTime: string | null;
  };
  reviewCount: number;
  reviews: CleanerPublicReview[];
  error?: string;
};

export type ResolveLocationResponse = {
  ok?: boolean;
  locationId?: string;
  cityId?: string;
  latitude?: number;
  longitude?: number;
  error?: string;
};

export type ConfirmBookingResponse = {
  success?: boolean;
  bookingId?: string;
  paystackReference?: string;
  payAmountZar?: number;
  creditAppliedZar?: number;
  requiresPayment?: boolean;
  /** Server public key — use for Inline so charge mode matches verify. */
  paystackPublicKey?: string;
  error?: string;
};
