import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("BOOKING-E2E-07C email-orphan ownership convergence", () => {
  it("repairs verified email-orphan ownership when an authenticated dashboard session starts", () => {
    const hook = read("hooks/useBookings.ts");
    expect(hook).toContain('"/api/auth/link-guest-bookings"');
    expect(hook).toContain("linkedCount");
    expect(hook).toContain("fetchBookings({ silent: true })");
  });

  it("keeps realtime subscriptions ownership-id scoped after repair", () => {
    const hook = read("hooks/useBookings.ts");
    expect(hook).toContain("customer_id=eq.${userId}");
    expect(hook).toContain("user_id=eq.${userId}");
    expect(hook).not.toContain("customer_email=eq.");
  });

  it("server linking remains JWT-email verified and only updates unowned rows", () => {
    const linker = read("lib/booking/linkBookingsToUserDb.ts");
    const route = read("app/api/auth/link-guest-bookings/route.ts");
    expect(route).toContain("pub.auth.getUser(token)");
    expect(route).toContain("normalizeEmail(userData.user.email)");
    expect(linker).toContain(".is(ownershipColumn, null)");
    expect(linker).toContain('.eq("customer_email", normalized)');
  });
});
