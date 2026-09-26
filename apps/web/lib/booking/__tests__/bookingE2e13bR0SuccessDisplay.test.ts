import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-13B R0 success display", () => {
  it("maps an authoritative covered settlement to zero paid cash for the success card", () => {
    const src = read("app/booking/success/page.tsx");
    expect(src).toContain("statusData.coveredSettlement === true");
    expect(src).toContain("? 0");
    expect(src).toContain("resolveCustomerTotalPaidZar");
  });

  it("renders zero paid cash explicitly as R0.00 instead of an em dash", () => {
    const src = read("components/booking/BookingConfirmationHero.tsx");
    expect(src).toContain('if (totalPaidZar === 0) return "R0.00"');
    expect(src).toContain("formatConfirmationPaidAmount(totalPaidZar)");
  });
});
