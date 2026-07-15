import type { ServiceSlug, CleanerMode } from "@/src/features/booking-v2/config/serviceConfig";

export type { ServiceSlug, CleanerMode };

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

export type BookingStep = 1 | 2 | 3 | 4;

export const BOOKING_STEP_LABELS: Record<BookingStep, string> = {
  1: "Details",
  2: "Schedule",
  3: "Review",
  4: "Payment",
};

export type RecurringFrequency = "weekly" | "fortnightly" | "monthly" | "custom";

export type BookingType = "once_off" | "recurring";

export type {
  CustomerPricingBreakdown as PricingSummary,
  PricingLineItem,
} from "@/lib/booking-v2/types";

import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";
import { emptyCustomerPricingBreakdown } from "@/lib/booking-v2/emptyPricingBreakdown";
import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";

export type BookingV2FormData = {
  // Step 1 — Details
  serviceSlug: ServiceSlug;
  serviceDetails: Record<string, string | number | boolean>;
  address: string;
  suburb: string;
  /** Resolved `locations.id` from suburb — set after Step 1 area pick. */
  serviceAreaLocationId: string;
  serviceAreaCityId: string;
  city?: string;
  postalCode?: string;
  accessInstructions: string;
  parkingInstructions: string;
  gateCode: string;
  contactPhone: string;
  selectedExtras: string[];

  /** Equipment delivery (regular cleaning only). */
  equipmentRequired: "yes" | "no" | "";
  equipmentQuote: EquipmentQuoteResult | null;

  // Step 2 — Schedule
  bookingType: BookingType;
  date: string;
  time: string;
  alternativeDate: string;
  alternativeTime: string;
  recurringFrequency: RecurringFrequency | "";
  recurringDays: string[];
  recurringStartDate: string;
  recurringEndDate: string;

  // Cleaner / team
  cleanerMode: CleanerMode;
  assignedTeamId: string;
  assignedTeamName: string;
  cleanerCount: number;
  selectedCleanerIds: string[];
  /** Full cleaner objects for selected IDs — populated at selection time so Step 3 can display them without a re-fetch. */
  selectedCleanerDetails: AvailableCleanerV2[];

  // Derived pricing (computed, not user-entered)
  pricingSummary: CustomerPricingBreakdown;
  /**
   * Persisted across Paystack redirect cancel so Step 4 can retry payment
   * without creating a duplicate booking.
   */
  pendingBookingId?: string | null;
};

export function defaultBookingFormData(serviceSlug: ServiceSlug, cleanerMode: CleanerMode): BookingV2FormData {
  return {
    serviceSlug,
    serviceDetails: {},
    address: "",
    suburb: "",
    serviceAreaLocationId: "",
    serviceAreaCityId: "",
    city: "Cape Town",
    postalCode: "",
    accessInstructions: "",
    parkingInstructions: "",
    gateCode: "",
    contactPhone: "",
    selectedExtras: [],
    equipmentRequired: "no",
    equipmentQuote: null,
    bookingType: "once_off",
    date: "",
    time: "",
    alternativeDate: "",
    alternativeTime: "",
    recurringFrequency: "",
    recurringDays: [],
    recurringStartDate: "",
    recurringEndDate: "",
    cleanerMode,
    assignedTeamId: "",
    assignedTeamName: "",
    cleanerCount: 1,
    selectedCleanerIds: [],
    selectedCleanerDetails: [],
    pricingSummary: emptyCustomerPricingBreakdown(),
    pendingBookingId: null,
  };
}
