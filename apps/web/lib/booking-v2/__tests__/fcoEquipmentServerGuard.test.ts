import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { issueEquipmentQuoteReceipt } from "@/lib/booking-v2/equipmentQuoteAuthority";
import {
  authorizeFcoEquipmentQuote,
  fcoEquipmentReceiptEnforced,
} from "@/lib/booking-v2/fcoEquipmentServerGuard";

const secret = "testing-fco-equipment-receipt-key-2026-long";
const address = { address: "21 Main Road, Unit 4", suburb: "Claremont", city: "Cape Town", postalCode: "7708" };
const issuedAtMs = 1_800_000_000_000;
const quote = {
  distance_km: 6, base_fee: 450, price_per_km: 25, distance_charge: 150,
  logistics_fee: 600, base_location: "Equipment base",
  manual_quote_required: false, manual_quote_message: "",
};
const receipt = issueEquipmentQuoteReceipt({
  address, distanceKm: 6, baseFeeZar: 450, distanceChargeZar: 150,
  logisticsFeeZar: 600, pricePerKmZar: 25, baseLocation: "Equipment base",
  pricingConfigRevision: "revision-v1", manualQuoteRequired: false,
  issuedAtMs, expiresAtMs: issuedAtMs + 10 * 60_000, secret,
});

afterEach(() => vi.unstubAllEnvs());

function enable() {
  vi.stubEnv("SHALEAN_APP_ENV", "staging");
  vi.stubEnv("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW", "true");
  vi.stubEnv("FCO_01_EQUIPMENT_RECEIPT_SECRET", secret);
}

const authorize = (
  overrides: Partial<Parameters<typeof authorizeFcoEquipmentQuote>[0]> = {},
) => authorizeFcoEquipmentQuote({
  serviceSlug: "regular-cleaning",
  equipmentRequired: "yes",
  suppliedQuote: { ...quote, authorityReceipt: receipt },
  delivery: address,
  allowProvisionalWithoutAddress: false,
  nowMs: issuedAtMs + 1000,
  ...overrides,
});

describe("FCO equipment receipt server enforcement", () => {
  it("is not activated in production, even when flag is set", () => {
    vi.stubEnv("SHALEAN_APP_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_FCO_01_REGULAR_HOME_PREVIEW", "true");
    expect(fcoEquipmentReceiptEnforced("regular-cleaning")).toBe(false);
    expect(authorize({ suppliedQuote: quote }).kind).toBe("not_required");
    enable();
    expect(fcoEquipmentReceiptEnforced("regular-cleaning")).toBe(true);
    expect(fcoEquipmentReceiptEnforced("deep-cleaning")).toBe(false);
  });

  it("uses only signed values, not altered client price components", () => {
    enable();
    const result = authorize({ suppliedQuote: { ...quote, base_fee: 1, distance_charge: 599, authorityReceipt: receipt } });
    expect(result.kind).toBe("authorized");
    if (result.kind === "authorized") {
      expect(result.quote.base_fee).toBe(450);
      expect(result.quote.distance_charge).toBe(150);
      expect(result.quote.logistics_fee).toBe(600);
    }
  });

  it("rejects absent, swapped, expired, and altered equipment quotes", () => {
    enable();
    expect(authorize({ suppliedQuote: quote }).kind).toBe("rejected");
    expect(authorize({ delivery: { ...address, address: "22 Main Road" } }).kind).toBe("rejected");
    expect(authorize({ suppliedQuote: { ...quote, logistics_fee: 0, authorityReceipt: receipt } }).kind).toBe("rejected");
    expect(authorize({ nowMs: issuedAtMs + 10 * 60_000 }).kind).toBe("rejected");
    expect(authorize({ equipmentRequired: "" }).kind).toBe("rejected");
    expect(authorize({ equipmentRequired: "no" }).kind).toBe("not_required");
  });

  it("allows only provisional quote before address, never at confirmation", () => {
    enable();
    expect(authorize({ delivery: { ...address, address: "" }, suppliedQuote: null, allowProvisionalWithoutAddress: true }).kind).toBe("provisional");
    expect(authorize({ delivery: { ...address, address: "" }, suppliedQuote: null, allowProvisionalWithoutAddress: false }).kind).toBe("rejected");
  });

  it("wires both financial boundaries to the gate", () => {
    const base = process.cwd();
    const quoteRoute = readFileSync(join(base, "app/api/booking-v2/quote/route.ts"), "utf8");
    const confirmRoute = readFileSync(join(base, "app/api/booking-v2/confirm/route.ts"), "utf8");
    const issuer = readFileSync(join(base, "app/api/booking-v2/equipment-quote/route.ts"), "utf8");
    expect(issuer).toContain("issueEquipmentQuoteReceipt");
    expect(quoteRoute).toContain("authorizeFcoEquipmentQuote");
    expect(confirmRoute).toContain("authorizeFcoEquipmentQuote");
    expect(quoteRoute).toContain("equipmentQuote: equipment.quote");
    expect(confirmRoute).toContain("const serverEquipmentQuote = equipmentAuthority.quote");
  });
});
