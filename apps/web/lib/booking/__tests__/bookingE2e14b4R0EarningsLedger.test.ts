import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-14B.4 R0 earnings-ledger convergence", () => {
  it("loads authoritative visit subtotal fields before line-item backfill", () => {
    const src = read("lib/booking/ensureBookingLineItemsForEarnings.ts");
    expect(src).toContain("base_amount_cents");
    expect(src).toContain("service_fee_cents");
    expect(src).toContain("buildBookingLineItemsFromRow");
  });

  it("treats authoritative base as cleaner-earning value and service fee as company-only", () => {
    const src = read("lib/booking/buildBookingLineItemsFromRow.ts");
    expect(src).toContain("backfill_v2_authoritative_subtotal");
    expect(src).toContain('source_column: "base_amount_cents"');
    expect(src).toContain('slug: "service-fee"');
    expect(src).toContain("earns_cleaner: false");
  });

  it("keeps completed-booking repair on the existing idempotent ledger path", () => {
    const src = read("lib/payout/persistCleanerPayout.ts");
    expect(src).toContain("computeCleanerEarningsForBooking");
    expect(src).toContain("repairBookingCompletionCoherenceIfNeeded");
    expect(src).toContain("ensureLedger: true");
  });
});
