import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

describe("AUDIT-02A03 staging-only repair verifier", () => {
  const src = readFileSync(
    join(process.cwd(), "app/api/test/a02-03-line-item-repair/route.ts"),
    "utf8",
  );

  it("is unavailable outside staging and uses the hardened production-route guard", () => {
    expect(src).toContain("isProductionTestRouteBlocked(request.url)");
    expect(src).toContain('resolveDeploymentEnvironment() !== "staging"');
    expect(src).toContain('{ status: 404 }');
  });

  it("requires a timing-safe verifier secret before accepting a fixture id", () => {
    expect(src).toContain("DISPATCH_LOAD_TEST_SECRET");
    expect(src).toContain("timingSafeEqualString(provided, secret)");
    expect(src).toContain('{ status: 401 }');
  });

  it("accepts only dedicated test fixtures", () => {
    expect(src).toContain("booking.is_test !== true");
    expect(src).toContain('booking.booking_source !== "audit_a02_03_fixture"');
    expect(src).toContain('{ status: 403 }');
  });

  it("serializes retries for the same fixture before invoking the real repair helper", () => {
    expect(src).toContain("const repairLocks = new Map<string, Promise<void>>()");
    expect(src).toContain("withBookingRepairLock(bookingId");
    expect(src).toContain("ensureBookingLineItemsForEarningsIfMissing(admin, bookingId)");
    expect(src).toContain("lineTotalCents");
    expect(src).toContain("cleanerLineCents");
  });
});
