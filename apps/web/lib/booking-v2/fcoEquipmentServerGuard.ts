import "server-only";
import { createHash } from "node:crypto";
import type { EquipmentPricingConfig } from "@/lib/booking-v2/equipmentPricing";

import type { EquipmentQuoteResult } from "@/lib/booking-v2/equipmentPricing";
import {
  type EquipmentDeliveryAddress,
  receiptToEquipmentQuote,
  verifyEquipmentQuoteReceipt,
} from "@/lib/booking-v2/equipmentQuoteAuthority";

/**
 * Release gate: the new equipment receipt contract is not imposed on existing
 * production bookings. Requires explicit staging/development enablement.
 */
export function fcoEquipmentReceiptEnforced(serviceSlug: string): boolean {
  return serviceSlug === "regular-cleaning" &&
    (process.env.SHALEAN_APP_ENV === "staging" ||
      process.env.SHALEAN_APP_ENV === "development") &&
    process.env.NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW === "true";
}

/** Stable revision of all inputs that determine the provider's logistics fee. */
export function fcoEquipmentPricingRevision(config: EquipmentPricingConfig): string {
  return createHash("sha256").update(JSON.stringify({
    is_active: config.is_active, base_fee_zar: config.base_fee_zar,
    price_per_km_zar: config.price_per_km_zar,
    max_auto_distance_km: config.max_auto_distance_km,
    base_address: config.base_address,
    base_latitude: config.base_latitude, base_longitude: config.base_longitude,
  })).digest("hex");
}

export function fcoEquipmentReceiptSecret(): string {
  const secret = (process.env.FCO_01_EQUIPMENT_RECEIPT_SECRET ||
    process.env.BOOKING_LOCK_HMAC_SECRET || "").trim();
  if (secret.length < 32) throw new Error("EQUIPMENT_RECEIPT_SECRET_UNAVAILABLE");
  return secret;
}

export type FcoEquipmentAuthorization =
  | { kind: "authorized"; quote: EquipmentQuoteResult }
  | { kind: "not_required"; quote: EquipmentQuoteResult | null }
  | { kind: "provisional"; quote: null }
  | { kind: "rejected"; code: string };

/** Always reconstruct trusted fee from signed receipt; never spread client quote. */
export function authorizeFcoEquipmentQuote(input: {
  serviceSlug: string;
  equipmentRequired: string;
  suppliedQuote: (EquipmentQuoteResult & { authorityReceipt?: string }) | null;
  delivery: EquipmentDeliveryAddress;
  allowProvisionalWithoutAddress: boolean;
  nowMs: number;
  expectedPricingConfigRevision?: string;
}): FcoEquipmentAuthorization {
  if (!fcoEquipmentReceiptEnforced(input.serviceSlug)) {
    return { kind: "not_required", quote: input.suppliedQuote };
  }
  if (input.equipmentRequired === "no") {
    return { kind: "not_required", quote: null };
  }
  if (input.equipmentRequired !== "yes") return { kind: "rejected", code: "EQUIPMENT_CHOICE_REQUIRED" };
  if (input.allowProvisionalWithoutAddress && !input.delivery.address.trim()) {
    // Home/Schedule may show indicative non-final pricing, never a payable
    // equipment charge. Final confirmation does not allow this path.
    return { kind: "provisional", quote: null };
  }
  if (!input.delivery.address.trim() || !input.delivery.suburb.trim()) {
    return { kind: "rejected", code: "EQUIPMENT_ADDRESS_REQUIRED" };
  }
  let secret: string;
  try {
    secret = fcoEquipmentReceiptSecret();
  } catch {
    return { kind: "rejected", code: "EQUIPMENT_SECURITY_UNAVAILABLE" };
  }
  const outcome = verifyEquipmentQuoteReceipt({
    receipt: input.suppliedQuote?.authorityReceipt,
    address: input.delivery,
    feeZar: input.suppliedQuote?.logistics_fee ?? NaN,
    secret,
    nowMs: input.nowMs,
  });
  if (!outcome.ok) return { kind: "rejected", code: "EQUIPMENT_RECEIPT_" + outcome.reason.toUpperCase() };
  if (!input.expectedPricingConfigRevision || outcome.quote.pricingConfigRevision !== input.expectedPricingConfigRevision) {
    return { kind: "rejected", code: "EQUIPMENT_PRICING_REVISION_CHANGED" };
  }
  return { kind: "authorized", quote: receiptToEquipmentQuote(outcome.quote) };
}
