import type { DemandLevelForecast } from "@/lib/marketplace-intelligence/types";

/** Mirrors {@link CustomerMarketingSegment} without importing server-only growth modules. */
export type SegmentKey = "new" | "repeat" | "loyal" | "churned";

/** Mirrors {@link GrowthAction} / {@link GrowthChannel} without importing server-only growth modules into shared types. */
export type GrowthActionKey = "offer_discount" | "upsell" | "do_nothing";
export type GrowthChannelKey = "whatsapp" | "email";

export type AiDecisionScope = "pricing" | "assignment" | "growth";

export type ConversionModelContext = {
  segment: SegmentKey | "unknown";
  /** Quoted or final headline price (same currency as revenue objective). */
  price: number;
  /** Hour 0–23 */
  hourOfDay: number;
  /** 0–6 JS weekday */
  dayOfWeek: number;
  channel: "web" | "whatsapp" | "email" | "sms" | "unknown";
  /** Optional: normalized price vs segment median (1 = unknown). */
  priceRatioToMedian?: number;
};

export type CleanerAcceptanceBookingSlice = {
  bookingId: string;
  dateYmd?: string;
  timeHm?: string;
  hourOfDay: number;
};

export type CleanerAcceptanceInput = {
  cleaner: {
    id: string;
    distanceKm: number;
    acceptanceRecent: number;
    acceptanceLifetime: number;
    recentDeclines: number;
    fatigueOffersLastHour: number;
    /** 0–1 from cleaners.marketplace_outcome_ema when present */
    outcomeEma?: number | null;
  };
  booking: CleanerAcceptanceBookingSlice;
};

export type DemandPrediction = {
  demand_level: DemandLevelForecast;
  predicted_bookings: number;
  confidence: number;
  explain: string;
};

export type GrowthRoiCandidate = {
  action: GrowthActionKey;
  channel: GrowthChannelKey;
  /** Unitless score; compared relatively inside optimizeDecision */
  predictedRoi: number;
  reason: string;
};
