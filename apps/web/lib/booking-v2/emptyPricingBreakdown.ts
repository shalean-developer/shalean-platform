import type { CustomerPricingBreakdown } from "@/lib/booking-v2/types";

export function emptyCustomerPricingBreakdown(): CustomerPricingBreakdown {
  return {
    base_service_price: 0,
    property_factors_total: 0,
    bedrooms_price: 0,
    bathrooms_price: 0,
    extra_rooms_price: 0,
    property_size_price: 0,
    selected_extras: [],
    selected_extras_total: 0,
    supplies_equipment_fee: 0,
    extra_cleaner_cost: 0,
    subtotal_before_service_fee: 0,
    service_fee: 0,
    recurring_discount: 0,
    estimated_total: 0,
    estimated_duration_minutes: 0,
    lineItems: [],
    basePrice: 0,
    extrasTotal: 0,
    cleanerSurcharge: 0,
    total: 0,
  };
}
