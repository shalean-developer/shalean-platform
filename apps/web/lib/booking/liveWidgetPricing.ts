import type { HomeWidgetQuoteInput, HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";
import { calculateHomeWidgetBaseEstimateZar, calculateHomeWidgetQuoteZar } from "@/lib/pricing/calculatePrice";
import type { PricingRatesSnapshot } from "@/lib/pricing/pricingRatesSnapshot";

export type { HomeWidgetServiceKey } from "@/lib/pricing/calculatePrice";

export type LiveWidgetPriceInput = HomeWidgetQuoteInput;

export function calculateLiveWidgetPrice(input: LiveWidgetPriceInput, snapshot: PricingRatesSnapshot): number {
  return calculateHomeWidgetQuoteZar(input, snapshot);
}

export function calculateLiveWidgetBaseEstimateZar(
  service: HomeWidgetServiceKey,
  snapshot: PricingRatesSnapshot,
): number {
  return calculateHomeWidgetBaseEstimateZar(service, snapshot);
}

/** Deterministic “slots left” for urgency (2–4) from date string; no network. */
export function slotsLeftForWidgetDate(dateYmd: string): number {
  if (!dateYmd.trim()) return 3;
  let h = 0;
  for (let i = 0; i < dateYmd.length; i++) {
    h = (h + dateYmd.charCodeAt(i) * (i + 1)) % 97;
  }
  return 2 + (h % 3);
}

export type LiveWidgetPersistedState = {
  bedrooms?: number;
  bathrooms?: number;
  /** Extra living spaces; `5` means “5+” in the UI. */
  extraRooms?: number;
  service: HomeWidgetServiceKey;
  date: string;
  time: string;
  extras: string[];
  location: string;
  quotedPriceZar: number;
  savedAt: string;
  /** When true, rooms/extras were not part of the homepage quote — booking step 1 owns final pricing. */
  estimateOnly?: boolean;
};
