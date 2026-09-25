import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("BOOKING-E2E-04 confirmation persistence convergence", () => {
  it("uses one mutable persistence contract for insert and pending-payment retry", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/booking-v2/confirm/route.ts"), "utf8");
    expect(src).toContain("const confirmationMutableFields = {");
    expect(src).toContain("booking_snapshot: bookingSnapshot");
    expect(src).toMatch(/\.update\(\{\s*\.\.\.confirmationMutableFields,/);
    expect((src.match(/\.\.\.confirmationMutableFields/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps retry-sensitive schedule, service details, extras and location in the shared contract", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "app/api/booking-v2/confirm/route.ts"), "utf8");
    const start = src.indexOf("const confirmationMutableFields = {");
    const end = src.indexOf("// ── 9. Reuse an existing pending_payment", start);
    const contract = src.slice(start, end);
    for (const field of [
      "service_details: data.serviceDetails",
      "selected_extras: selectedExtraIds",
      "location: data.address",
      "booking_type: data.bookingType",
      "recurring_frequency: data.recurringFrequency",
      "alt_date: data.alternativeDate",
      "price_snapshot: priceSnapshot",
      "booking_snapshot: bookingSnapshot",
    ]) expect(contract).toContain(field);
  });
});
