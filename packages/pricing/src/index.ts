export {
  applyRecurringDiscountZar,
  computeServiceFeeZar,
  type BookingV2FeesLike,
  type BookingV2ServiceFeeRule,
  type RecurringDiscountRule,
} from "./fees";

export {
  estimateBookingV2DurationMinutes,
  resolveBookingV2DurationEstimate,
  type BookingV2DurationResult,
  type BookingV2DurationServiceSlug,
} from "./durationV2";

export {
  applyVipToCleaningSubtotalZar,
  getVipDiscountMultiplier,
  normalizeVipTier,
  VIP_APPLIES_ON_BOOKING_V2,
  type VipDiscountResult,
  type VipTier,
} from "./vipPolicy";

export {
  computePropertyFactors,
  EXTRA_CLEANER_SERVICE_SLUGS,
  ROOM_BASED_SERVICE_SLUGS,
  type PropertyFactorRatesConfig,
  type PropertyFactorResult,
} from "./propertyFactors";
