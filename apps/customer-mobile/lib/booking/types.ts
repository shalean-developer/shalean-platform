import type {
  AvailableCleanerV2,
  CustomerPricingBreakdown,
  EquipmentQuoteResult,
} from "@/services/types/bookingV2";
import type { CleanerMode, ServiceSlug } from "@/lib/booking/serviceMeta";

export type RecurringFrequency = "weekly" | "fortnightly" | "monthly" | "custom";
export type BookingType = "once_off" | "recurring";

export type BookingFormData = {
  serviceSlug: ServiceSlug;
  serviceDetails: Record<string, string | number | boolean>;
  address: string;
  suburb: string;
  serviceAreaLocationId: string;
  serviceAreaCityId: string;
  city?: string;
  postalCode?: string;
  accessInstructions: string;
  parkingInstructions: string;
  gateCode: string;
  contactPhone: string;
  selectedExtras: string[];
  equipmentRequired: "yes" | "no" | "";
  equipmentQuote: EquipmentQuoteResult | null;
  bookingType: BookingType;
  date: string;
  time: string;
  alternativeDate: string;
  alternativeTime: string;
  recurringFrequency: RecurringFrequency | "";
  recurringDays: string[];
  recurringStartDate: string;
  recurringEndDate: string;
  cleanerMode: CleanerMode;
  assignedTeamId: string;
  assignedTeamName: string;
  cleanerCount: number;
  selectedCleanerIds: string[];
  selectedCleanerDetails: AvailableCleanerV2[];
  pricingSummary: CustomerPricingBreakdown;
};

export type BookingWizardStep = 1 | 2 | 3 | 4;
