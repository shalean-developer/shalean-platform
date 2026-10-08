import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AUDIT-02A03 staging-only repair verifier", () => {
  const src = readFileSync(
    join(process.cwd(), "app/api/test/a02-03-line-item-repair/route.ts"),
    "utf8",
  );

  it("is unavailable outside staging", () => {
    expect(src).toContain('resolveDeploymentEnvironment() !== "staging"');
    expect(src).toContain('{ status: 404 }');
  });

  it("accepts only dedicated test fixtures", () => {
    expect(src).toContain("booking.is_test !== true");
    expect(src).toContain('booking.booking_source !== "audit_a02_03_fixture"');
    expect(src).toContain('{ status: 403 }');
  });

  it("invokes the real missing-ledger repair helper", () => {
    expect(src).toContain("ensureBookingLineItemsForEarningsIfMissing(admin, bookingId)");
    expect(src).toContain("lineTotalCents");
    expect(src).toContain("cleanerLineCents");
  });
});
