import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * FCO-01 receipt primitive. The authoritative issuer MUST use
 * server-recomputed equipment charges, never client amounts.
 *
 * A receipt binds an equipment fee to exact delivery details, scope and expiry.
 * Never sign client-supplied fee values without server recomputation.
 */
export type EquipmentQuoteReceiptPayload = {
  v: 1;
  purpose: "regular-cleaning-equipment-logistics";
  addressHash: string;
  sessionHash: string;
  equipmentRequired: true;
  distanceKm: number;
  baseFeeZar: number;
  distanceChargeZar: number;
  logisticsFeeZar: number;
  pricePerKmZar: number;
  baseLocation: string;
  pricingConfigRevision: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

export type EquipmentDeliveryAddress = {
  address: string;
  suburb: string;
  city: string;
  postalCode?: string | null;
};

export type EquipmentQuoteAuthorityOutcome =
  | { ok: true; quote: EquipmentQuoteReceiptPayload }
  | { ok: false; reason: "missing" | "invalid" | "expired" | "session_mismatch" | "address_mismatch" | "fee_mismatch" | "manual_quote_required" };

export function canonicalEquipmentDeliveryAddress(value: EquipmentDeliveryAddress): string {
  // Case, leading/trailing and repeated whitespace normalization only;
  // do not remove street numbers or apartment information.
  return JSON.stringify([
    value.address.trim().replace(/\s+/g, " ").toLowerCase(),
    value.suburb.trim().replace(/\s+/g, " ").toLowerCase(),
    value.city.trim().replace(/\s+/g, " ").toLowerCase(),
    (value.postalCode ?? "").trim().replace(/\s+/g, " ").toLowerCase(),
  ]);
}

export function equipmentDeliveryAddressHash(value: EquipmentDeliveryAddress): string {
  return createHash("sha256").update(canonicalEquipmentDeliveryAddress(value)).digest("hex");
}

function receiptKey(secret: string): Buffer {
  if (secret.length < 32) throw new Error("EQUIPMENT_RECEIPT_SECRET_UNAVAILABLE");
  // Domain separation: cannot interchange the existing booking lock signature
  // and a delivery equipment receipt.
  return createHmac("sha256", secret)
    .update("shalean:fco-01:equipment-receipt:v1")
    .digest();
}

function validMoney(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validPayload(value: unknown): value is EquipmentQuoteReceiptPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const p = value as Partial<EquipmentQuoteReceiptPayload>;
  return p.v === 1 &&
    p.purpose === "regular-cleaning-equipment-logistics" &&
    p.equipmentRequired === true &&
    typeof p.addressHash === "string" && /^[a-f0-9]{64}$/.test(p.addressHash) &&
    typeof p.sessionHash === "string" && /^[a-f0-9]{64}$/.test(p.sessionHash) &&
    typeof p.pricingConfigRevision === "string" && p.pricingConfigRevision.trim().length > 0 &&
    typeof p.distanceKm === "number" && Number.isFinite(p.distanceKm) && p.distanceKm >= 0 &&
    validMoney(p.baseFeeZar) && validMoney(p.distanceChargeZar) && validMoney(p.logisticsFeeZar) &&
    validMoney(p.pricePerKmZar) && typeof p.baseLocation === "string" && p.baseLocation.trim().length > 0 &&
    p.baseFeeZar + p.distanceChargeZar === p.logisticsFeeZar &&
    typeof p.issuedAtMs === "number" && Number.isSafeInteger(p.issuedAtMs) &&
    typeof p.expiresAtMs === "number" && Number.isSafeInteger(p.expiresAtMs) &&
    p.issuedAtMs > 0 && p.expiresAtMs > p.issuedAtMs &&
    p.expiresAtMs - p.issuedAtMs <= 30 * 60_000;
}

/**
 * Issuer only: supply amounts from quoteEquipmentForAddress on the server, not
 * from a client request. Manual/geocode-unresolved delivery is never eligible.
 */
export function issueEquipmentQuoteReceipt(input: {
  address: EquipmentDeliveryAddress;
  sessionHash: string;
  distanceKm: number;
  baseFeeZar: number;
  distanceChargeZar: number;
  logisticsFeeZar: number;
  pricePerKmZar: number;
  baseLocation: string;
  pricingConfigRevision: string;
  manualQuoteRequired: boolean;
  geocodeError?: boolean;
  issuedAtMs: number;
  expiresAtMs: number;
  secret: string;
}): string {
  if (input.manualQuoteRequired || input.geocodeError) throw new Error("EQUIPMENT_MANUAL_QUOTE_REQUIRED");
  if (!input.address.address.trim() || !input.address.suburb.trim()) throw new Error("EQUIPMENT_ADDRESS_REQUIRED");
  const payload: EquipmentQuoteReceiptPayload = {
    v: 1,
    purpose: "regular-cleaning-equipment-logistics",
    addressHash: equipmentDeliveryAddressHash(input.address),
    sessionHash: input.sessionHash,
    equipmentRequired: true,
    distanceKm: input.distanceKm,
    baseFeeZar: input.baseFeeZar,
    distanceChargeZar: input.distanceChargeZar,
    logisticsFeeZar: input.logisticsFeeZar,
    pricePerKmZar: input.pricePerKmZar,
    baseLocation: input.baseLocation,
    pricingConfigRevision: input.pricingConfigRevision,
    issuedAtMs: input.issuedAtMs,
    expiresAtMs: input.expiresAtMs,
  };
  if (!validPayload(payload)) throw new Error("EQUIPMENT_RECEIPT_INVALID");
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", receiptKey(input.secret)).update(encoded).digest("base64url");
  return encoded + "." + signature;
}

/**
 * Checker for a future quote + confirm route integration. Verifies authenticity,
 * exact delivery address and the fee shown in the booking. Never silently
 * downgrade a failed check to customer-supplied pricing.
 */
export function verifyEquipmentQuoteReceipt(input: {
  receipt: string | null | undefined;
  address: EquipmentDeliveryAddress;
  feeZar: number;
  sessionHash: string | null;
  secret: string;
  nowMs: number;
}): EquipmentQuoteAuthorityOutcome {
  if (!input.receipt) return { ok: false, reason: "missing" };
  const parts = input.receipt.split(".");
  if (parts.length !== 2 || parts[0].length > 4096 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) ||
    !/^[A-Za-z0-9_-]+$/.test(parts[1])) return { ok: false, reason: "invalid" };

  // No fallback secret in production: the caller must explicitly supply
  // a protected server-only secret already managed by the application.
  const expected = createHmac("sha256", receiptKey(input.secret)).update(parts[0]).digest();
  const provided = Buffer.from(parts[1], "base64url");
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) {
    return { ok: false, reason: "invalid" };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (!validPayload(decoded)) return { ok: false, reason: "invalid" };
  if (input.nowMs < decoded.issuedAtMs || input.nowMs >= decoded.expiresAtMs) {
    return { ok: false, reason: "expired" };
  }
  if (!input.sessionHash || !/^[a-f0-9]{64}$/.test(input.sessionHash) || input.sessionHash !== decoded.sessionHash) {
    return { ok: false, reason: "session_mismatch" };
  }
  if (equipmentDeliveryAddressHash(input.address) !== decoded.addressHash) {
    return { ok: false, reason: "address_mismatch" };
  }
  if (!validMoney(input.feeZar) || input.feeZar !== decoded.logisticsFeeZar) {
    return { ok: false, reason: "fee_mismatch" };
  }
  return { ok: true, quote: decoded };
}

/** Convert verified signed fields into the only equipment breakdown that can
 * enter a booking quote. Do not spread or trust caller-provided quote fields.
 */
export function receiptToEquipmentQuote(payload: EquipmentQuoteReceiptPayload) {
  return {
    distance_km: payload.distanceKm,
    base_fee: payload.baseFeeZar,
    price_per_km: payload.pricePerKmZar,
    distance_charge: payload.distanceChargeZar,
    logistics_fee: payload.logisticsFeeZar,
    base_location: payload.baseLocation,
    manual_quote_required: false,
    manual_quote_message: "",
  };
}
