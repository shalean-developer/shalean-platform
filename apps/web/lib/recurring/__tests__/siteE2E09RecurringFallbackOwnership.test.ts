import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(process.cwd(), "lib/recurring/recurringPaymentLinkFallback.ts"), "utf8");

describe("SITE-E2E-09 recurring payment fallback ownership", () => {
  it("uses the resolved booking ownership column instead of hardcoding user_id", () => {
    expect(src).toContain("const ownershipColumn = await resolveBookingOwnershipColumn(admin)");
    expect(src).toContain("{ [ownershipColumn]: preservedUserId }");
    expect(src).not.toContain("{ user_id: preservedUserId }");
  });

  it("stamps recurring_fallback_at only after the guarded payment-link patch succeeds", () => {
    const patch = src.indexOf('payment_link_expires_at: expiresAt');
    const patchError = src.indexOf("if (patchErr)");
    const fallbackStamp = src.indexOf("recurring_fallback_at");
    expect(patch).toBeGreaterThan(-1);
    expect(patchError).toBeGreaterThan(patch);
    expect(fallbackStamp).toBeGreaterThan(patchError);
  });
});
