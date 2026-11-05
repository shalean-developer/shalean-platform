import { describe, expect, it } from "vitest";
import {
  canonicalEquipmentDeliveryAddress,
  equipmentDeliveryAddressHash,
  issueEquipmentQuoteReceipt,
  verifyEquipmentQuoteReceipt,
} from "@/lib/booking-v2/equipmentQuoteAuthority";

const secret = "fco-01-testing-secret-with-at-least-32-characters";
const sessionHash = "a".repeat(64);
const address = { address: "21 Main Road, Unit 4", suburb: "Claremont", city: "Cape Town", postalCode: "7708" };
const base = {
  address, sessionHash,
  distanceKm: 6.5,
  baseFeeZar: 450,
  distanceChargeZar: 163,
  logisticsFeeZar: 613,
  pricePerKmZar: 25,
  baseLocation: "Cape Town equipment base",
  pricingConfigRevision: "pricing-policy-v1",
  manualQuoteRequired: false,
  issuedAtMs: 1_800_000_000_000,
  expiresAtMs: 1_800_000_300_000,
  secret,
};

function verify(receipt: string, overrides: Partial<Parameters<typeof verifyEquipmentQuoteReceipt>[0]> = {}) {
  return verifyEquipmentQuoteReceipt({
    receipt, address, feeZar: 613, sessionHash, secret, nowMs: base.issuedAtMs + 1000, ...overrides,
  });
}

describe("FCO-01 C4 server-only equipment receipt contract", () => {
  it("binds the quoted fee to the exact address, without leaking the address in the receipt", () => {
    const token = issueEquipmentQuoteReceipt(base);
    const checked = verify(token);
    expect(checked.ok).toBe(true);
    expect(token).not.toContain("Main");
    expect(Buffer.from(token.split(".")[0], "base64url").toString()).not.toContain("Main Road");
    expect(verify(token, { address: { ...address, address: "22 Main Road, Unit 4" } }))
      .toEqual({ ok: false, reason: "address_mismatch" });
    expect(verify(token, { address: { ...address, suburb: "Rondebosch" } }))
      .toEqual({ ok: false, reason: "address_mismatch" });
  });

  it("blocks a copied receipt in a different browser session", () => {
    const token = issueEquipmentQuoteReceipt(base);
    expect(verify(token, { sessionHash: "b".repeat(64) }))
      .toEqual({ ok: false, reason: "session_mismatch" });
    expect(verify(token, { sessionHash: null }))
      .toEqual({ ok: false, reason: "session_mismatch" });
  });

  it("normalizes harmless case and whitespace but keeps apartment numbers", () => {
    expect(canonicalEquipmentDeliveryAddress(address)).toBe(canonicalEquipmentDeliveryAddress({
      address: " 21   MAIN Road, Unit 4 ", suburb: "claremont", city: "CAPE town", postalCode: "7708",
    }));
    expect(equipmentDeliveryAddressHash(address)).not.toBe(equipmentDeliveryAddressHash({
      ...address, address: "21 Main Road, Unit 5",
    }));
  });

  it("rejects tampered fee, wrong key and corrupt signatures", () => {
    const token = issueEquipmentQuoteReceipt(base);
    expect(verify(token, { feeZar: 0 })).toEqual({ ok: false, reason: "fee_mismatch" });
    expect(verify(token, { feeZar: 612 })).toEqual({ ok: false, reason: "fee_mismatch" });
    expect(verify(token, { secret: "another-test-secret-that-is-long-enough" }))
      .toEqual({ ok: false, reason: "invalid" });
    const [payload, signature] = token.split(".");
    const corruptedSignature = (signature.startsWith("A") ? "B" : "A") + signature.slice(1);
    expect(verify(`${payload}.${corruptedSignature}`).ok).toBe(false);
    expect(verify("bad")).toEqual({ ok: false, reason: "invalid" });
    expect(verify("", {})).toEqual({ ok: false, reason: "missing" });
  });

  it("expires and refuses future-issued or excessive-duration receipts", () => {
    const token = issueEquipmentQuoteReceipt(base);
    expect(verify(token, { nowMs: base.expiresAtMs })).toEqual({ ok: false, reason: "expired" });
    expect(verify(token, { nowMs: base.issuedAtMs - 1 })).toEqual({ ok: false, reason: "expired" });
    expect(() => issueEquipmentQuoteReceipt({ ...base, expiresAtMs: base.issuedAtMs + 31 * 60_000 }))
      .toThrow("EQUIPMENT_RECEIPT_INVALID");
  });

  it("fails closed for unresolved/manual quote, malformed fee, missing address, and short key", () => {
    expect(() => issueEquipmentQuoteReceipt({ ...base, manualQuoteRequired: true }))
      .toThrow("EQUIPMENT_MANUAL_QUOTE_REQUIRED");
    expect(() => issueEquipmentQuoteReceipt({ ...base, geocodeError: true }))
      .toThrow("EQUIPMENT_MANUAL_QUOTE_REQUIRED");
    expect(() => issueEquipmentQuoteReceipt({ ...base, logisticsFeeZar: 0 }))
      .toThrow("EQUIPMENT_RECEIPT_INVALID");
    expect(() => issueEquipmentQuoteReceipt({ ...base, address: { ...address, address: "" } }))
      .toThrow("EQUIPMENT_ADDRESS_REQUIRED");
    expect(() => issueEquipmentQuoteReceipt({ ...base, secret: "short" }))
      .toThrow("EQUIPMENT_RECEIPT_SECRET_UNAVAILABLE");
  });

  it("preserves the existing signed booking quote boundary as a separate authority", () => {
    // Equipment receipt validates one logistics component only.
    // Payment must ALSO pass booking quote-lock, eligibility, and server amount checks.
    const receipt = issueEquipmentQuoteReceipt(base);
    const outcome = verify(receipt);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.quote.pricingConfigRevision).toBe("pricing-policy-v1");
      expect(outcome.quote.equipmentRequired).toBe(true);
      expect(outcome.quote.logisticsFeeZar).toBe(613);
    }
  });
});
