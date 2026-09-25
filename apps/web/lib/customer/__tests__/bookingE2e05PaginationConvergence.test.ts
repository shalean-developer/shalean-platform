import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");

describe("BOOKING-E2E-05 customer pagination convergence", () => {
  it("removes the no-parameter full-history API compatibility path", () => {
    const src = read("app/api/customer/bookings/route.ts");
    expect(src).not.toContain("loadLegacyCompleteBookingHistory");
    expect(src).not.toContain("legacyNoParameterRequest");
    expect(src).toContain("loadCustomerBookingPageForUser");
  });

  it("defaults the shared customer booking hook to paged mode", () => {
    const src = read("hooks/useBookings.ts");
    expect(src).toContain('const mode = options?.mode === "complete" ? "complete" : "paged";');
  });

  it("keeps consumers that still require complete historical aggregates explicit", () => {
    for (const file of [
      "app/(ui-redesign)/account/payments/page.tsx",
      "app/(ui-redesign)/account/invoices/page.tsx",
      "app/(ui-redesign)/account/profile/page.tsx",
    ]) {
      expect(read(file)).toContain('useBookings({ mode: "complete" })');
    }
  });

  it("lets recent booking history use the bounded default", () => {
    expect(read("components/booking/checkout/BookingHistoryMobileSheet.tsx")).toContain("useBookings()");
  });
});
